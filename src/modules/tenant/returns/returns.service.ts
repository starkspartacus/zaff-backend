import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RepairsService } from '../repairs/repairs.service';
import { Actor, normalizeSerial } from '../sales/sales.service';
import { ReturnPolicy } from '../settings/return-policy';
import { evaluateReturn, ReturnAction } from './return-rules';
import { ProductReturn, ProductReturnSchema } from './schemas/product-return.schema';
import { CreditNote, CreditNoteSchema } from './schemas/credit-note.schema';
import { CreateReturnDto } from './dto/returns.dto';

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const ACTION_LABEL: Record<ReturnAction, string> = {
  credit_note: 'avoir',
  refund: 'remboursement',
  exchange: 'échange',
  warranty_repair: 'réparation sous garantie',
  paid_repair: 'réparation payante',
};

const SOLD_FIELDS_RESET = { saleId: null, invoiceNumber: null, soldPrice: null, soldBy: null, soldByName: null, soldAt: null };

@Injectable()
export class ReturnsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly repairsService: RepairsService,
    private readonly notifications: NotificationsService,
  ) {}

  private m<T>(db: string, name: string, schema: any) { return this.tenantConnectionService.getModel<T>(db, name, schema); }
  private units(db: string) { return this.m<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private products(db: string) { return this.m<Product>(db, Product.name, ProductSchema); }
  private sales(db: string) { return this.m<Sale>(db, Sale.name, SaleSchema); }
  private customers(db: string) { return this.m<Customer>(db, Customer.name, CustomerSchema); }
  private warranties(db: string) { return this.m<Warranty>(db, Warranty.name, WarrantySchema); }
  private movements(db: string) { return this.m<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private returns(db: string) { return this.m<ProductReturn>(db, ProductReturn.name, ProductReturnSchema); }
  private creditNotes(db: string) { return this.m<CreditNote>(db, CreditNote.name, CreditNoteSchema); }

  /** Appareil vendu + vente + garantie : tout ce qu'il faut pour décider */
  private async context(db: string, rawSerial: string) {
    const serialNumber = normalizeSerial(rawSerial);
    const unit = await this.units(db).findOne({ serialNumber });
    if (!unit) throw new NotFoundException(`Le N° de série ${serialNumber} n'a pas été vendu par la boutique.`);
    if (unit.status === UnitStatus.IN_STOCK) throw new BadRequestException(`L'appareil ${serialNumber} est en stock : il n'a pas encore été vendu.`);
    if (unit.status === UnitStatus.IN_REPAIR || unit.status === UnitStatus.DEFECTIVE) {
      const last = await this.returns(db).findOne({ unitId: unit._id }).sort({ createdAt: -1 });
      throw new BadRequestException(
        `L'appareil ${serialNumber} a déjà été retourné${last ? ` (retour RET-${last.returnNumber}${last.repairTicketNumber ? `, ticket SAV-${last.repairTicketNumber}` : ''})` : ''}.`,
      );
    }
    const sale = unit.saleId ? await this.sales(db).findById(unit.saleId).populate('customerId') : null;
    if (!sale) throw new BadRequestException(`La vente de l'appareil ${serialNumber} est introuvable.`);
    const product = await this.products(db).findById(unit.productId);
    const item = sale.items.find((i) => i.serialNumber === serialNumber);
    const warranty = await this.warranties(db).findOne({ serialNumber, saleId: sale._id });
    const price = unit.soldPrice ?? item?.unitPrice ?? 0;
    return { serialNumber, unit, sale, product, price, warranty };
  }

  /** Ce que le vendeur peut proposer pour cet appareil, selon la politique de la boutique */
  async lookup(db: string, policy: ReturnPolicy, rawSerial: string) {
    const { serialNumber, unit, sale, product, price, warranty } = await this.context(db, rawSerial);
    const evaluation = evaluateReturn(policy, { soldAt: sale.saleDate, price, warrantyEnd: warranty?.warrantyEnd || null });
    const customer: any = sale.customerId;
    return {
      serialNumber,
      unitId: unit._id,
      product: product ? { _id: product._id, name: product.name, brand: product.brand, model: product.model, color: product.color } : null,
      sale: {
        _id: sale._id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate,
        sellerName: sale.sellerName,
        paymentMethod: sale.paymentMethod,
        customer: customer ? { _id: customer._id, name: customer.name, phone: customer.phone } : null,
      },
      ...evaluation,
    };
  }

  /** Enregistre le retour : réapplique la politique, met à jour l'appareil, le stock, l'avoir, le SAV, la caisse */
  async create(db: string, policy: ReturnPolicy, actor: Actor, dto: CreateReturnDto) {
    const { serialNumber, unit, sale, product, price, warranty } = await this.context(db, dto.serialNumber);
    const ev = evaluateReturn(policy, { soldAt: sale.saleDate, price, warrantyEnd: warranty?.warrantyEnd || null });
    const branch = dto.reason === 'change_of_mind' ? ev.changeOfMind : ev.defective;
    if (!branch.allowed) throw new BadRequestException(branch.reason || 'Retour non autorisé par la boutique.');
    const option = branch.options.find((o) => o.action === dto.action);
    if (!option) throw new BadRequestException(`La solution « ${ACTION_LABEL[dto.action]} » n'est pas proposée pour ce retour.`);

    if (dto.reason === 'change_of_mind') {
      const checked = new Set(dto.conditionsChecked || []);
      const missing = ev.changeOfMind.conditions.filter((c) => !checked.has(c));
      if (missing.length) throw new BadRequestException(`Condition non remplie : ${missing[0]}. Le retour ne peut pas être accepté.`);
    } else if (!dto.issueDescription?.trim()) {
      throw new BadRequestException('Décrivez la panne constatée.');
    }
    if (dto.action === 'refund' && (!dto.refundMethod || !option.refundMethods?.includes(dto.refundMethod))) {
      throw new BadRequestException('Choisissez le mode de remboursement (espèces ou Mobile Money).');
    }

    // Ce que devient l'appareil
    const isRepair = dto.action === 'warranty_repair' || dto.action === 'paid_repair';
    const backInStock = dto.reason === 'change_of_mind';
    const statusAfter = backInStock ? UnitStatus.IN_STOCK : isRepair ? UnitStatus.IN_REPAIR : UnitStatus.DEFECTIVE;

    // Réservation atomique de l'appareil vendu : deux retours simultanés sont impossibles
    const claimed = await this.units(db).findOneAndUpdate(
      { _id: unit._id, status: UnitStatus.SOLD },
      { $set: { status: statusAfter, ...(isRepair ? {} : SOLD_FIELDS_RESET), notes: dto.notes || unit.notes } },
      { new: true },
    );
    if (!claimed) throw new BadRequestException(`L'appareil ${serialNumber} vient d'être retourné.`);

    try {
      if (backInStock) {
        await this.products(db).updateOne({ _id: unit.productId }, { $inc: { stockQuantity: 1 } });
        await this.movements(db).create({
          productId: unit.productId,
          movementType: StockMovementType.IN,
          quantity: 1,
          referenceType: StockReferenceType.ADJUSTMENT,
          referenceId: String(sale.invoiceNumber),
          notes: `Retour client ${serialNumber} (facture #${sale.invoiceNumber}) — remis en vente`,
        });
      }

      const customerId = await this.resolveCustomer(db, sale, dto);
      const returnNumber = await this.nextNumber(db);
      const amount = option.amount ?? 0;
      const ret = await this.returns(db).create({
        returnNumber,
        unitId: unit._id,
        serialNumber,
        productId: unit.productId,
        productName: product?.name || 'Appareil',
        saleId: sale._id,
        invoiceNumber: sale.invoiceNumber,
        customerId,
        reason: dto.reason,
        action: dto.action,
        defectiveStage: dto.reason === 'defective' ? ev.defective.stage : null,
        conditionsChecked: dto.conditionsChecked || [],
        issueDescription: dto.issueDescription?.trim() || null,
        daysSincePurchase: ev.daysSincePurchase,
        price,
        fee: dto.reason === 'change_of_mind' ? ev.changeOfMind.fee : 0,
        amount: isRepair ? 0 : amount,
        refundMethod: dto.action === 'refund' ? dto.refundMethod : null,
        unitStatusAfter: statusAfter,
        processedBy: new Types.ObjectId(actor.userId),
        processedByName: actor.name,
        notes: dto.notes || null,
      });

      // Avoir (bon d'achat ou échange)
      if (dto.action === 'credit_note' || dto.action === 'exchange') {
        const note = await this.issueCreditNote(db, policy, actor, ret, customerId, amount, dto.action === 'exchange', dto.customerName);
        ret.creditNoteId = note._id as Types.ObjectId;
        ret.creditNoteCode = note.code;
      }

      // Atelier : réparation de l'appareil du client, ou de l'appareil repris par la boutique
      if (dto.reason === 'defective') {
        const repair = await this.repairsService.createFromReturn(db, {
          customerId: isRepair ? customerId : null,
          productId: unit.productId as Types.ObjectId,
          unitId: unit._id as Types.ObjectId,
          saleId: sale._id as Types.ObjectId,
          returnId: ret._id as Types.ObjectId,
          deviceName: product?.name || 'Appareil',
          serialNumber,
          issueDescription: dto.issueDescription!.trim(),
          underWarranty: dto.action !== 'paid_repair',
          ownership: isRepair ? 'customer' : 'shop',
        });
        ret.repairId = repair._id as Types.ObjectId;
        ret.repairTicketNumber = repair.ticketNumber;
        if (dto.action === 'warranty_repair' && warranty) {
          await this.warranties(db).updateOne({ _id: warranty._id }, { $set: { status: 'claimed' } });
        }
      }
      await ret.save();

      // Facture : retour (partiel si d'autres articles restent)
      const remaining = await this.units(db).countDocuments({ saleId: sale._id, status: UnitStatus.SOLD });
      await this.sales(db).updateOne({ _id: sale._id }, { $set: { returnStatus: remaining ? 'partial' : 'returned', returnDate: new Date() } });

      await this.publish(db, actor, ret);
      return ret;
    } catch (e) {
      // Annulation : l'appareil redevient vendu au client, le stock n'a pas bougé
      await this.units(db).updateOne(
        { _id: unit._id },
        { $set: { status: UnitStatus.SOLD, saleId: unit.saleId, invoiceNumber: unit.invoiceNumber, soldPrice: unit.soldPrice, soldBy: unit.soldBy, soldByName: unit.soldByName, soldAt: unit.soldAt } },
      );
      if (backInStock) await this.products(db).updateOne({ _id: unit.productId }, { $inc: { stockQuantity: -1 } }).catch(() => undefined);
      throw e;
    }
  }

  private async resolveCustomer(db: string, sale: any, dto: CreateReturnDto): Promise<Types.ObjectId | null> {
    if (sale.customerId) return sale.customerId._id || sale.customerId;
    if (!dto.customerName && !dto.customerPhone) return null;
    const existing = dto.customerPhone ? await this.customers(db).findOne({ phone: dto.customerPhone }) : null;
    const customer = existing || (await this.customers(db).create({ name: dto.customerName || dto.customerPhone, phone: dto.customerPhone || null }));
    return customer._id as Types.ObjectId;
  }

  private async nextNumber(db: string) {
    const last = await this.returns(db).findOne().sort({ returnNumber: -1 });
    return last ? last.returnNumber + 1 : 1001;
  }

  private async issueCreditNote(db: string, policy: ReturnPolicy, actor: Actor, ret: any, customerId: Types.ObjectId | null, amount: number, forExchange: boolean, customerName?: string) {
    const model = this.creditNotes(db);
    const expiresAt = new Date(Date.now() + policy.creditNoteValidityDays * 24 * 3600 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await model.findOne().sort({ number: -1 });
      const n = (last?.number || 1000) + 1 + attempt;
      try {
        return await model.create({
          code: `AV-${n}`,
          number: n,
          amount,
          balance: amount,
          status: 'active',
          expiresAt,
          customerId,
          customerName: customerName || null,
          returnId: ret._id,
          forExchange,
          issuedBy: new Types.ObjectId(actor.userId),
          issuedByName: actor.name,
        });
      } catch (e: any) {
        if (e?.code !== 11000) throw e; // code déjà pris par un autre poste : on réessaie
      }
    }
    throw new BadRequestException("Impossible de générer le code de l'avoir, réessayez.");
  }

  private async publish(db: string, actor: Actor, ret: any) {
    const what =
      ret.action === 'refund'
        ? `remboursement de ${fmt(ret.amount)} (${ret.refundMethod === 'mobile' ? 'Mobile Money' : 'espèces'})`
        : ret.action === 'credit_note' || ret.action === 'exchange'
        ? `${ret.action === 'exchange' ? 'échange' : 'avoir'} ${ret.creditNoteCode} de ${fmt(ret.amount)}`
        : `${ACTION_LABEL[ret.action as ReturnAction]} (ticket SAV-${ret.repairTicketNumber})`;
    await this.notifications.notify(db, {
      type: 'return.created',
      title: ret.reason === 'defective' ? 'Retour défectueux' : 'Retour client',
      message: `${actor.name} a enregistré le retour de ${ret.productName} (${ret.serialNumber}) : ${what}.`,
      level: ret.reason === 'defective' ? 'warning' : 'info',
      roles: ret.repairId ? ['admin', 'storekeeper'] : ['admin'],
      actorId: actor.userId,
      data: { returnId: String(ret._id), amount: ret.amount || undefined, invoiceNumber: ret.invoiceNumber },
    });
    this.notifications.invalidate(db, ['units', 'products', 'stock', 'sales', 'repairs', 'dashboard', 'cash-closings', 'returns', 'my-stats']);
  }

  async list(db: string, filter: { processedBy?: string; days?: number }) {
    const query: Record<string, unknown> = {};
    if (filter.processedBy) query.processedBy = new Types.ObjectId(filter.processedBy);
    if (filter.days) query.createdAt = { $gte: new Date(Date.now() - filter.days * 24 * 3600 * 1000) };
    return this.returns(db).find(query).populate('customerId').sort({ createdAt: -1 }).limit(200).lean().exec();
  }

  /** Vérifier un avoir avant de l'utiliser à la caisse */
  async findCreditNote(db: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const note = await this.creditNotes(db).findOne({ code }).lean().exec();
    if (!note) throw new NotFoundException(`Avoir ${code} introuvable.`);
    const expired = note.expiresAt < new Date();
    return { ...note, usable: note.status === 'active' && note.balance > 0 && !expired, expired };
  }

  async listCreditNotes(db: string, status?: string) {
    const query: Record<string, unknown> = {};
    if (status && status !== 'all') query.status = status;
    return this.creditNotes(db).find(query).sort({ createdAt: -1 }).limit(200).lean().exec();
  }
}
