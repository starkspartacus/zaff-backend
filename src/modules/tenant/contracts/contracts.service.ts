import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { EstablishmentsService } from '../../global/establishments/establishments.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { resolveReturnPolicy } from '../settings/return-policy';
import { effectiveWarrantyEnd } from '../returns/return-rules';
import { findCountry } from '../../../common/geo/geo';
import { paymentLabel } from '../../../common/enums/payment-labels';
import { ContractVersion, ContractVersionSchema } from './contract-version.schema';
import { ContractContext, ContractItem, ContractSettings, renderContract, resolveContract } from './contract-template';
import { ContractSettingsDto } from './dto/contract-settings.dto';
import { WARRANTY_CODES, WarrantyCodes } from './warranty-code';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { UnitStatus } from '../../../common/enums/unit-status.enum';

/** N° de série partiellement masqué : de quoi le comparer à l'appareil, sans l'exposer en entier */
export const maskSerial = (s: string | null) => (!s ? null : s.length <= 6 ? s : `${s.slice(0, 3)}${'•'.repeat(Math.min(6, s.length - 7))}${s.slice(-4)}`);
const DAY = 24 * 3600 * 1000;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

@Injectable()
export class ContractsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly establishmentsService: EstablishmentsService,
    @Optional() @Inject(WARRANTY_CODES) private readonly codes?: WarrantyCodes,
  ) {}

  private m<T>(db: string, name: string, schema: any) { return this.tenantConnectionService.getModel<T>(db, name, schema); }
  private sales(db: string) { return this.m<Sale>(db, Sale.name, SaleSchema); }
  private products(db: string) { return this.m<Product>(db, Product.name, ProductSchema); }
  private warranties(db: string) { return this.m<Warranty>(db, Warranty.name, WarrantySchema); }
  private units(db: string) { return this.m<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private versions(db: string) { return this.m<ContractVersion>(db, ContractVersion.name, ContractVersionSchema); }

  getSettings(tenant: any): ContractSettings {
    return resolveContract(tenant.settings?.salesContract);
  }

  /** Enregistre une nouvelle version (les ventes passées gardent celle de leur date) */
  async saveSettings(tenant: any, dto: ContractSettingsDto) {
    const current = this.getSettings(tenant);
    const now = new Date();
    const stored = {
      mode: dto.mode,
      legal: Object.fromEntries(Object.entries(dto.legal).map(([k, v]) => [k, String(v ?? '').trim()])),
      title: dto.title?.trim() || '',
      subtitle: dto.subtitle?.trim() ?? '',
      intro: dto.intro?.trim() || '',
      // Mode « défaut » : on ne garde pas d'articles, le texte suit le modèle de ZAFF
      articles: dto.mode === 'custom' ? (dto.articles || []).map((a) => ({ ...a, title: a.title.trim(), body: a.body.trim() })) : [],
      warrantyCard: dto.warrantyCard,
      version: current.version + 1,
      updatedAt: now.toISOString(),
    };
    const updated = await this.establishmentsService.updateSettings(String(tenant._id), 'salesContract', stored);
    await this.versions(tenant.databaseName).create({ version: stored.version, settings: stored, effectiveFrom: now });
    return resolveContract((updated.settings as any)?.salesContract);
  }

  /** Contrat en vigueur à une date donnée */
  private async settingsAt(tenant: any, date: Date): Promise<ContractSettings> {
    const v = await this.versions(tenant.databaseName).findOne({ effectiveFrom: { $lte: date } }).sort({ effectiveFrom: -1 }).exec();
    if (v) return resolveContract(v.settings as any);
    // Aucune version avant cette vente : modèle par défaut, avec les informations légales actuelles
    const now = this.getSettings(tenant);
    return { ...resolveContract(null), legal: now.legal };
  }

  private shopOf(tenant: any): ContractContext['shop'] {
    const country = findCountry(tenant.countryCode);
    const address = [tenant.address, tenant.commune, tenant.city, country?.name].filter(Boolean).join(', ');
    return {
      name: tenant.name,
      address: address || null,
      phone: tenant.phone || null,
      email: tenant.email || null,
      countryCode: tenant.countryCode || null,
      countryName: country?.name || null,
      currency: tenant.currency || 'F CFA',
    };
  }

  /** Contrat de vente et de garantie d'une vente, prêt à imprimer */
  async forSale(tenant: any, saleId: string) {
    const db = tenant.databaseName;
    if (!Types.ObjectId.isValid(saleId)) throw new NotFoundException('Vente non trouvée.');
    const sale: any = await this.sales(db).findById(saleId).populate('customerId').exec();
    if (!sale) throw new NotFoundException('Vente non trouvée.');

    const policy = resolveReturnPolicy(tenant.settings);
    const productIds = [...new Set(sale.items.map((i: any) => String(i.productId)))];
    const products = await this.products(db).find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id as string)) } }).exec();
    const byId = new Map(products.map((p: any) => [String(p._id), p]));
    const warranties: any[] = await this.warranties(db).find({ saleId: sale._id }).exec();

    const items: ContractItem[] = sale.items.map((i: any, line: number) => {
      const p: any = byId.get(String(i.productId)) || {};
      // Même règle que les retours : garantie enregistrée à la vente, sinon garantie par défaut de la boutique
      const w = warranties.find((x) => (i.serialNumber ? x.serialNumber === i.serialNumber : String(x.productId) === String(i.productId)));
      const end = effectiveWarrantyEnd(policy, new Date(sale.saleDate), w?.warrantyEnd || null);
      const months = w?.warrantyDurationMonths ?? (end ? policy.defective.defaultWarrantyMonths : 0);
      return {
        productName: i.productName,
        category: p.category || i.productCategory || null,
        brand: p.brand || null,
        model: p.model || null,
        color: p.color || null,
        serialNumber: i.serialNumber || null,
        reference: p.sku || i.productSku || null,
        condition: p.condition || 'new',
        accessories: p.accessories || null,
        quantity: i.quantity,
        price: i.unitPrice,
        warrantyMonths: months,
        warrantyStart: iso(w?.warrantyStart || sale.saleDate)!,
        warrantyEnd: iso(end),
        verifyCode: this.codes && line < 256 ? this.codes.encode(tenant._id, sale._id, line) : null,
      };
    });

    const c: any = sale.customerId;
    const settings = await this.settingsAt(tenant, new Date(sale.saleDate));
    return renderContract(settings, {
      shop: this.shopOf(tenant),
      customer: c ? { name: c.name || null, phone: c.phone || null, email: c.email || null, address: c.address || null } : null,
      sale: {
        id: String(sale._id),
        invoiceNumber: sale.invoiceNumber,
        date: iso(sale.saleDate)!,
        subtotal: sale.subtotal,
        discount: sale.discount || 0,
        total: sale.total,
        creditNoteAmount: sale.creditNoteAmount || 0,
        paymentLabel: paymentLabel(sale.paymentMethod),
        sellerName: sale.sellerName || null,
      },
      items,
      policy,
    });
  }

  /** Aperçu avec une vente fictive (paramètres enregistrés ou brouillon en cours de modification) */
  preview(tenant: any, draft?: ContractSettingsDto) {
    const settings = draft ? resolveContract({ ...draft, version: this.getSettings(tenant).version } as any) : this.getSettings(tenant);
    const policy = resolveReturnPolicy(tenant.settings);
    const now = new Date();
    const months = policy.defective.defaultWarrantyMonths || 12;
    const end = new Date(new Date(now).setMonth(now.getMonth() + months));
    return renderContract(
      settings,
      {
        shop: this.shopOf(tenant),
        customer: { name: 'Client exemple', phone: null, email: null, address: null },
        sale: {
          id: 'apercu',
          invoiceNumber: 1001,
          date: now.toISOString(),
          subtotal: 850000,
          discount: 0,
          total: 850000,
          creditNoteAmount: 0,
          paymentLabel: paymentLabel('cash'),
          sellerName: 'Vendeur',
        },
        items: [
          {
            productName: 'iPhone 15 Pro',
            category: 'Smartphones',
            brand: 'Apple',
            model: '256 Go',
            color: 'Titane naturel',
            serialNumber: '356789104512345',
            reference: 'IPH15P-256',
            condition: 'new',
            accessories: 'Câble USB-C, boîte',
            quantity: 1,
            price: 850000,
            warrantyMonths: months,
            warrantyStart: now.toISOString(),
            warrantyEnd: end.toISOString(),
            verifyCode: null,
          },
        ],
        policy,
      },
      { sample: true },
    );
  }

  /**
   * Vérification publique d'une garantie (QR code de la fiche) : uniquement l'appareil, la boutique et
   * l'état de la garantie — jamais le client, le prix ni le N° de série complet.
   */
  async verify(code: string) {
    const invalid = new NotFoundException("Ce QR code n'est pas reconnu : la garantie ne peut pas être confirmée. Demandez la facture au vendeur.");
    const ref = this.codes?.decode(code);
    if (!ref) throw invalid;
    const tenant: any = await this.establishmentsService.findById(ref.establishmentId).catch(() => null);
    if (!tenant) throw invalid;
    const db = tenant.databaseName;
    const sale: any = await this.sales(db).findById(ref.saleId).exec();
    const item = sale?.items?.[ref.line];
    if (!item) throw invalid;

    const policy = resolveReturnPolicy(tenant.settings);
    const product: any = await this.products(db).findById(item.productId).exec();
    const warranties: any[] = await this.warranties(db).find({ saleId: sale._id }).exec();
    const w = warranties.find((x) => (item.serialNumber ? x.serialNumber === item.serialNumber : String(x.productId) === String(item.productId)));
    const end = effectiveWarrantyEnd(policy, new Date(sale.saleDate), w?.warrantyEnd || null);
    const months = w?.warrantyDurationMonths ?? (end ? policy.defective.defaultWarrantyMonths : 0);

    // Ce qu'est devenu l'appareil depuis la vente
    let device: 'with_customer' | 'in_repair' | 'returned' = 'with_customer';
    if (item.serialNumber) {
      const unit: any = await this.units(db).findOne({ serialNumber: item.serialNumber }).exec();
      if (unit && String(unit.saleId) !== String(sale._id)) device = 'returned';
      else if (unit?.status === UnitStatus.IN_REPAIR) device = 'in_repair';
      else if (unit && unit.status !== UnitStatus.SOLD) device = 'returned';
    }
    const now = Date.now();
    const status = device === 'returned' ? 'returned' : !end ? 'none' : end.getTime() >= now ? 'active' : 'expired';
    const country = findCountry(tenant.countryCode);

    return {
      status,
      device,
      daysLeft: end && status === 'active' ? Math.ceil((end.getTime() - now) / DAY) : 0,
      warrantyMonths: months,
      purchaseDate: iso(sale.saleDate),
      warrantyEnd: iso(end),
      invoiceNumber: sale.invoiceNumber,
      product: {
        name: item.productName,
        brand: product?.brand || null,
        model: product?.model || null,
        color: product?.color || null,
        serialMasked: maskSerial(item.serialNumber || null),
      },
      shop: {
        name: (tenant.settings?.salesContract?.legal?.legalName || tenant.name) as string,
        city: [tenant.commune, tenant.city, country?.name].filter(Boolean).join(', ') || null,
        phone: tenant.phone || null,
        active: tenant.status !== 'suspended',
      },
    };
  }
}
