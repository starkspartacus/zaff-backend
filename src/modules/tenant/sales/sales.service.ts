import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { SaleReturn, SaleReturnSchema } from '../common/schemas/sale-return.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { CreateSaleDto, ReturnSaleDto } from './dto/create-sale.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { paymentLabel } from '../../../common/enums/payment-labels';
import { CreditNote, CreditNoteSchema } from '../returns/schemas/credit-note.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { CustomerPayment, CustomerPaymentSchema } from '../common/schemas/customer-payment.schema';
import { nextSequence } from '../common/sequence';
import { toE164 } from '../../../common/geo/geo';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { SaleType } from '../../../common/enums/sale-type.enum';

export interface Actor {
  userId: string;
  name: string;
  /** Rôle du collaborateur : un vendeur ne peut pas vendre à perte */
  role?: string;
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

/** Statut de paiement d'une vente selon son reste à payer */
export const paymentStatusOf = (total: number, amountDue: number) => (amountDue <= 0 ? 'paid' : amountDue >= total ? 'unpaid' : 'partial');

export const normalizeSerial = (serial: string) => serial.replace(/\s+/g, '').toUpperCase();

const SOLD_FIELDS_RESET = {
  status: UnitStatus.IN_STOCK,
  saleId: null,
  invoiceNumber: null,
  soldPrice: null,
  soldBy: null,
  soldByName: null,
  soldAt: null,
};

@Injectable()
export class SalesService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getSaleReturnModel(db: string) { return this.tenantConnectionService.getModel<SaleReturn>(db, SaleReturn.name, SaleReturnSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private getWarrantyModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }
  private getCreditNoteModel(db: string) { return this.tenantConnectionService.getModel<CreditNote>(db, CreditNote.name, CreditNoteSchema); }
  private getCounterModel(db: string) { return this.tenantConnectionService.getModel<Counter>(db, Counter.name, CounterSchema); }
  private getPaymentModel(db: string) { return this.tenantConnectionService.getModel<CustomerPayment>(db, CustomerPayment.name, CustomerPaymentSchema); }

  /** N° de facture suivant, atomique (jamais deux ventes avec le même numéro) */
  private nextInvoiceNumber(db: string) {
    return nextSequence(this.getCounterModel(db), 'invoice', async () => {
      const last = await this.getSaleModel(db).findOne().sort({ invoiceNumber: -1 }).exec();
      return last?.invoiceNumber || 1000;
    });
  }

  /**
   * Utilise un avoir sur une vente : débit atomique du solde (jamais en dessous de zéro).
   * Renvoie le montant déduit et la fonction d'annulation.
   */
  private async redeemCreditNote(db: string, rawCode: string, total: number) {
    const model = this.getCreditNoteModel(db);
    const code = rawCode.trim().toUpperCase();
    const note = await model.findOne({ code });
    if (!note) throw new BadRequestException(`Avoir ${code} introuvable.`);
    if (note.status !== 'active' || note.balance <= 0) throw new BadRequestException(`L'avoir ${code} a déjà été utilisé.`);
    if (note.expiresAt < new Date()) throw new BadRequestException(`L'avoir ${code} a expiré le ${note.expiresAt.toLocaleDateString('fr-FR')}.`);

    const amount = Math.min(note.balance, total);
    const updated = await model.findOneAndUpdate(
      { _id: note._id, status: 'active', balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );
    if (!updated) throw new BadRequestException(`L'avoir ${code} vient d'être utilisé, réessayez.`);
    if (updated.balance <= 0) await model.updateOne({ _id: note._id }, { $set: { status: 'used' } });
    return {
      code,
      amount,
      noteId: note._id,
      undo: () => model.updateOne({ _id: note._id }, { $inc: { balance: amount }, $set: { status: 'active' } }),
    };
  }

  async findAll(db: string, filter: { sellerId?: string } = {}) {
    const query: any = {};
    if (filter.sellerId) query.sellerId = new Types.ObjectId(filter.sellerId);
    return this.getSaleModel(db).find(query).populate('customerId').sort({ saleDate: -1 }).exec();
  }

  async findById(db: string, id: string, viewer?: { userId: string; role?: string }) {
    const sale = await this.getSaleModel(db).findById(id).populate('customerId').exec();
    if (!sale) throw new NotFoundException('Vente non trouvée.');
    // Un vendeur ne consulte que ses propres ventes
    if (viewer?.role === 'seller' && String(sale.sellerId) !== String(viewer.userId)) throw new NotFoundException('Vente non trouvée.');
    const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
    return { sale, returns };
  }

  async create(db: string, dto: CreateSaleDto, seller?: Actor, opts: { country?: string | null } = {}) {
    const saleModel = this.getSaleModel(db);
    const prodModel = this.getProductModel(db);
    const unitModel = this.getUnitModel(db);
    const custModel = this.getCustomerModel(db);
    const movModel = this.getStockMovementModel(db);
    const warModel = this.getWarrantyModel(db);

    if (!dto.items?.length) throw new BadRequestException('Le panier est vide.');
    const reseller = dto.saleType === SaleType.RESELLER;
    // Téléphone du client au format international (même client retrouvé quelle que soit l'écriture)
    if (dto.customerPhone?.trim()) dto.customerPhone = toE164(dto.customerPhone, opts.country) || dto.customerPhone.trim();
    const onCredit = dto.paymentMethod === PaymentMethod.CREDIT;

    // 1. Contrôles préalables (aucune écriture) : le serveur fixe les prix et les totaux
    const products = new Map<string, any>();
    const serials = new Set<string>();
    let costTotal = 0;
    for (const item of dto.items) {
      if (!Types.ObjectId.isValid(item.productId)) throw new BadRequestException(`Produit '${item.productName}' invalide.`);
      const product = products.get(item.productId) || (await prodModel.findById(item.productId));
      if (!product) throw new NotFoundException(`Produit '${item.productName}' non trouvé.`);
      products.set(item.productId, product);

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(`Quantité invalide pour '${product.name}'.`);
      }
      if (product.hasSerialNumbers) {
        if (!item.serialNumber) {
          throw new BadRequestException(`Scannez le N° de série de '${product.name}' pour le vendre.`);
        }
        if (item.quantity !== 1) {
          throw new BadRequestException(`'${product.name}' se vend à l'unité : une ligne par N° de série.`);
        }
        item.serialNumber = normalizeSerial(item.serialNumber);
        if (serials.has(item.serialNumber)) {
          throw new BadRequestException(`Le N° de série ${item.serialNumber} est en double dans le panier.`);
        }
        serials.add(item.serialNumber);
      } else {
        item.serialNumber = undefined;
      }

      // Prix du catalogue (tarif revendeur pour une vente revendeur), sauf prix négocié
      const catalogPrice = reseller && product.resellerPrice > 0 ? product.resellerPrice : product.salePrice;
      const unitPrice = Math.round(item.unitPrice ?? catalogPrice ?? 0);
      if (seller?.role === 'seller' && product.purchasePrice > 0 && unitPrice < product.purchasePrice) {
        throw new BadRequestException(
          `Prix trop bas pour '${product.name}' : ${fmt(unitPrice)}, en dessous du prix d'achat. Demandez au propriétaire.`,
        );
      }
      item.unitPrice = unitPrice;
      item.total = unitPrice * item.quantity;
      item.productName = product.name;
      costTotal += (product.purchasePrice || 0) * item.quantity;
    }
    const subtotal = dto.items.reduce((sum, i) => sum + (i.total || 0), 0);
    const discount = Math.round(dto.discount || 0);
    if (discount > subtotal) throw new BadRequestException(`La remise (${fmt(discount)}) dépasse le montant du panier (${fmt(subtotal)}).`);
    const total = subtotal - discount;
    if (seller?.role === 'seller' && discount > 0 && costTotal > 0 && total < costTotal) {
      throw new BadRequestException('Remise trop forte : la vente passerait sous le prix d\'achat. Demandez au propriétaire.');
    }
    dto.subtotal = subtotal;
    dto.discount = discount;
    dto.total = total;

    // Client : vérifié avant toute écriture ; obligatoire pour une vente à crédit (qui doit payer ?)
    if (dto.customerId) {
      const found = Types.ObjectId.isValid(dto.customerId) ? await custModel.findById(dto.customerId) : null;
      if (!found) throw new BadRequestException('Client introuvable : choisissez-le à nouveau.');
      // Le tarif revendeur est réservé aux clients enregistrés comme revendeurs
      if (reseller && !found.isReseller) {
        throw new BadRequestException(`${found.name} n'est pas enregistré comme revendeur : le tarif revendeur ne s'applique pas.`);
      }
    } else if (reseller && !dto.customerName?.trim() && !dto.customerPhone?.trim()) {
      throw new BadRequestException('Une vente au tarif revendeur doit être faite à un revendeur : choisissez-le.');
    } else if (onCredit && !dto.customerName?.trim() && !dto.customerPhone?.trim()) {
      throw new BadRequestException('Une vente à crédit doit être faite à un client (nom ou téléphone) : il devra payer le reste.');
    }

    // 2. Réservation atomique des unités et du stock (annulée en cas d'échec)
    const rollback: Array<() => Promise<unknown>> = [];
    const lowStock: any[] = [];
    let credit: { code: string; amount: number; noteId: unknown } | null = null;
    const undo = async () => {
      for (const fn of rollback.reverse()) await fn().catch(() => undefined);
    };
    try {
      for (const item of dto.items) {
        const product = products.get(item.productId);

        if (product.hasSerialNumbers) {
          const unit = await unitModel.findOneAndUpdate(
            { serialNumber: item.serialNumber, productId: product._id, status: UnitStatus.IN_STOCK },
            {
              status: UnitStatus.SOLD,
              soldPrice: item.unitPrice,
              soldBy: seller ? new Types.ObjectId(seller.userId) : null,
              soldByName: seller?.name || null,
              soldAt: new Date(),
            },
            { new: true },
          );
          if (!unit) throw new BadRequestException(await this.describeUnavailable(db, item.serialNumber!, product));
          rollback.push(() => unitModel.updateOne({ _id: unit._id }, SOLD_FIELDS_RESET));
        }

        const updated = await prodModel.findOneAndUpdate(
          { _id: product._id, stockQuantity: { $gte: item.quantity } },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true },
        );
        if (!updated) {
          throw new BadRequestException(`Stock insuffisant pour '${product.name}' (Dispo: ${product.stockQuantity}).`);
        }
        rollback.push(() => prodModel.updateOne({ _id: product._id }, { $inc: { stockQuantity: item.quantity } }));
        if (updated.stockQuantity <= (updated.minStockAlert ?? 0)) lowStock.push(updated);
      }
      // Avoir (échange / bon d'achat) : déduit du montant à encaisser
      if (dto.creditNoteCode) {
        const redeemed = await this.redeemCreditNote(db, dto.creditNoteCode, total);
        rollback.push(redeemed.undo);
        credit = redeemed;
      }
    } catch (e) {
      await undo();
      throw e;
    }

    // À crédit : acompte versé maintenant, le reste est dû par le client
    const toPay = total - (credit?.amount || 0);
    const deposit = onCredit ? Math.round(dto.depositAmount || 0) : 0;
    if (deposit > toPay) {
      await undo();
      throw new BadRequestException(`L'acompte (${fmt(deposit)}) dépasse le montant de la vente (${fmt(toPay)}) : choisissez un autre mode de paiement.`);
    }
    const amountDue = onCredit ? toPay - deposit : 0;

    let sale: any;
    let nextInvoiceNumber: number;
    let customerId: Types.ObjectId | null = null;
    try {
      // 3. Numéro de facture séquentiel propre à l'établissement (atomique)
      nextInvoiceNumber = await this.nextInvoiceNumber(db);

      // 4. Client (existant ou créé à la volée)
      if (dto.customerId) {
        customerId = new Types.ObjectId(dto.customerId);
      } else if (dto.customerName?.trim() || dto.customerPhone?.trim()) {
        const phone = dto.customerPhone?.trim() || null;
        const existing = phone ? await custModel.findOne({ phone }) : null;
        const customer =
          existing ||
          (await custModel.create({
            name: dto.customerName?.trim() || phone,
            phone,
            isReseller: reseller,
          }));
        customerId = customer._id as Types.ObjectId;
      }

      // 5. Création de la vente
      sale = await saleModel.create({
        invoiceNumber: nextInvoiceNumber,
        customerId,
        saleDate: new Date(),
        subtotal,
        discount,
        total,
        paidAmount: onCredit ? deposit : (dto.paidAmount ?? toPay),
        creditNoteCode: credit?.code || null,
        creditNoteAmount: credit?.amount || 0,
        depositAmount: deposit,
        depositMethod: deposit ? dto.depositMethod || 'cash' : null,
        amountDue,
        paymentStatus: paymentStatusOf(toPay, amountDue),
        returnedAmount: 0,
        paymentMethod: dto.paymentMethod,
        saleType: dto.saleType,
        items: dto.items.map((i) => ({
          ...i,
          productId: new Types.ObjectId(i.productId),
          productSku: i.productSku || products.get(i.productId).sku,
          productCategory: i.productCategory || products.get(i.productId).category,
        })),
        notes: dto.notes || null,
        sellerId: seller ? new Types.ObjectId(seller.userId) : null,
        sellerName: seller?.name || null,
        closingId: null,
      });
    } catch (e) {
      // Rien n'est vendu : les appareils, le stock et l'avoir sont remis comme avant
      await undo();
      throw e;
    }

    // Dette du client et acompte (compté dans la caisse du vendeur)
    if (customerId && amountDue > 0) {
      await custModel.updateOne({ _id: customerId }, { $inc: { balance: amountDue } });
    }
    if (customerId && deposit > 0) {
      const customer = await custModel.findById(customerId);
      await this.getPaymentModel(db).create({
        customerId,
        customerName: customer?.name || null,
        amount: deposit,
        method: dto.depositMethod || 'cash',
        kind: 'deposit',
        allocations: [{ saleId: sale._id, invoiceNumber: nextInvoiceNumber, amount: deposit }],
        notes: `Acompte facture #${nextInvoiceNumber}`,
        collectedBy: seller ? new Types.ObjectId(seller.userId) : null,
        collectedByName: seller?.name || null,
        closingId: null,
      });
    }

    if (credit) {
      await this.getCreditNoteModel(db).updateOne(
        { _id: credit.noteId },
        { $push: { uses: { saleId: sale._id, invoiceNumber: nextInvoiceNumber, amount: credit.amount, at: new Date() } } },
      );
    }

    // 6. Traçabilité : unités liées à la facture, mouvements de stock, stats client
    if (serials.size) {
      await unitModel.updateMany(
        { serialNumber: { $in: [...serials] } },
        { saleId: sale._id, invoiceNumber: nextInvoiceNumber },
      );
    }
    for (const item of dto.items) {
      await movModel.create({
        productId: new Types.ObjectId(item.productId),
        movementType: StockMovementType.OUT,
        quantity: item.quantity,
        referenceType: StockReferenceType.SALE,
        referenceId: String(nextInvoiceNumber),
        notes: item.serialNumber
          ? `Vente #${nextInvoiceNumber} — N° série ${item.serialNumber}`
          : `Vente #${nextInvoiceNumber}`,
      });
    }
    if (customerId) {
      await custModel.findByIdAndUpdate(customerId, { $inc: { totalPurchases: total } });
    }

    // 7. Garanties automatiques si demandées
    for (const item of dto.items) {
      if (item.warrantyEnabled && customerId) {
        const months = item.warrantyMonths || 12;
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);

        await warModel.create({
          saleId: sale._id,
          customerId,
          productId: new Types.ObjectId(item.productId),
          productName: item.productName,
          serialNumber: item.serialNumber || null,
          warrantyStart: start,
          warrantyDurationMonths: months,
          warrantyEnd: end,
        });
      }
    }

    await this.publishSale(db, sale, seller, lowStock);
    return sale;
  }

  /** Temps réel : le propriétaire voit la vente, le magasinier les ruptures */
  private async publishSale(db: string, sale: any, seller: Actor | undefined, lowStock: any[]) {
    const items = sale.items.map((i: any) => (i.quantity > 1 ? `${i.quantity} × ${i.productName}` : i.productName));
    await this.notifications.notify(db, {
      type: 'sale.created',
      title: 'Nouvelle vente',
      message: `${seller?.name || 'Caisse'} a vendu ${items.join(', ')} · ${paymentLabel(sale.paymentMethod)}`,
      level: 'success',
      roles: ['admin'],
      actorId: seller?.userId,
      data: {
        saleId: String(sale._id),
        invoiceNumber: sale.invoiceNumber,
        amount: sale.total,
        sellerName: seller?.name || null,
        paymentMethod: sale.paymentMethod,
      },
    });
    for (const p of lowStock) {
      await this.notifications.notify(db, {
        type: 'stock.low',
        title: p.stockQuantity <= 0 ? 'Rupture de stock' : 'Stock bas',
        message: p.stockQuantity <= 0 ? `${p.name} est en rupture.` : `${p.name} : plus que ${p.stockQuantity} en stock.`,
        level: p.stockQuantity <= 0 ? 'error' : 'warning',
        roles: ['admin', 'storekeeper'],
        data: { productId: String(p._id), stockQuantity: p.stockQuantity },
      });
    }
    this.notifications.invalidate(db, ['sales', 'units', 'products', 'stock', 'dashboard', 'my-stats', 'customers', 'cash-closings']);
  }

  /** Message clair expliquant pourquoi une unité ne peut pas être vendue */
  private async describeUnavailable(db: string, serial: string, product: any): Promise<string> {
    const unit = await this.getUnitModel(db).findOne({ serialNumber: serial });
    if (!unit) return `Le N° de série ${serial} n'est pas enregistré en stock.`;
    if (String(unit.productId) !== String(product._id)) {
      return `Le N° de série ${serial} correspond à un autre produit que '${product.name}'.`;
    }
    if (unit.status === UnitStatus.SOLD) {
      return `L'appareil ${serial} a déjà été vendu${unit.invoiceNumber ? ` (facture #${unit.invoiceNumber})` : ''}.`;
    }
    return `L'appareil ${serial} n'est pas disponible à la vente (statut : ${unit.status}).`;
  }

  /**
   * Retour de marchandise sur une vente (lot invendu d'un revendeur…), propriétaire seulement.
   * Chaque article doit venir de cette vente et ne peut être retourné qu'une fois ; sa valeur
   * (remise comprise) réduit d'abord le reste à payer, le surplus est remboursé si demandé.
   */
  async returnItems(db: string, saleId: string, dto: ReturnSaleDto, actor?: Actor) {
    const saleModel = this.getSaleModel(db);
    const returnModel = this.getSaleReturnModel(db);
    const prodModel = this.getProductModel(db);
    const unitModel = this.getUnitModel(db);
    const movModel = this.getStockMovementModel(db);
    const custModel = this.getCustomerModel(db);

    if (!Types.ObjectId.isValid(saleId)) throw new NotFoundException('Vente non trouvée.');
    const sale: any = await saleModel.findById(saleId);
    if (!sale) throw new NotFoundException('Vente non trouvée.');
    if (!dto.items?.length) throw new BadRequestException('Choisissez au moins un article à retourner.');

    // Quantités déjà retournées par produit
    const previous = await returnModel.find({ saleId: sale._id }).exec();
    const returned = new Map<string, number>();
    for (const r of previous) returned.set(String(r.productId), (returned.get(String(r.productId)) || 0) + r.quantity);
    const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1; // remise répartie sur les articles

    // 1. Contrôles (aucune écriture)
    const lines: Array<{ item: (typeof dto.items)[number]; product: any; serial: string | null; value: number }> = [];
    const asked = new Map<string, number>();
    for (const item of dto.items) {
      const soldLines = sale.items.filter((i: any) => String(i.productId) === String(item.productId));
      if (!soldLines.length) throw new BadRequestException(`Cet article ne fait pas partie de la facture #${sale.invoiceNumber}.`);
      const product = await prodModel.findById(item.productId);
      const name = product?.name || soldLines[0].productName;
      let serial: string | null = null;
      let unitPrice = soldLines[0].unitPrice;
      if (product?.hasSerialNumbers || soldLines.some((l: any) => l.serialNumber)) {
        if (!item.serialNumber) throw new BadRequestException(`Indiquez le N° de série de '${name}' à retourner.`);
        serial = normalizeSerial(item.serialNumber);
        const line = soldLines.find((l: any) => l.serialNumber === serial);
        if (!line) throw new BadRequestException(`Le N° de série ${serial} ne fait pas partie de cette vente.`);
        if (item.quantity !== 1) throw new BadRequestException(`'${name}' se retourne à l'unité.`);
        unitPrice = line.unitPrice;
      }
      const sold = soldLines.reduce((n: number, l: any) => n + l.quantity, 0);
      const already = (returned.get(String(item.productId)) || 0) + (asked.get(String(item.productId)) || 0);
      if (already + item.quantity > sold) {
        throw new BadRequestException(`'${name}' : ${sold} vendu(s), ${already} déjà retourné(s) — impossible d'en retourner ${item.quantity} de plus.`);
      }
      asked.set(String(item.productId), (asked.get(String(item.productId)) || 0) + item.quantity);
      lines.push({ item, product, serial, value: Math.round(unitPrice * item.quantity * ratio) });
    }

    // 2. Appareils à N° de série : réservation atomique (vendu sur cette facture → en stock)
    const done: string[] = [];
    for (const l of lines) {
      if (!l.serial) continue;
      const res = await unitModel.updateOne({ serialNumber: l.serial, saleId: sale._id, status: UnitStatus.SOLD }, SOLD_FIELDS_RESET);
      if (!res.modifiedCount) {
        for (const s of done) await unitModel.updateOne({ serialNumber: s }, { status: UnitStatus.SOLD, saleId: sale._id, invoiceNumber: sale.invoiceNumber }).catch(() => undefined);
        throw new BadRequestException(`L'appareil ${l.serial} n'est plus vendu sur cette facture (déjà retourné ?).`);
      }
      done.push(l.serial);
    }

    // 3. Stock, mouvements, retours
    const createdReturns: any[] = [];
    for (const l of lines) {
      if (l.product) {
        await prodModel.updateOne({ _id: l.product._id }, { $inc: { stockQuantity: l.item.quantity } });
        await movModel.create({
          productId: l.product._id,
          movementType: StockMovementType.IN,
          quantity: l.item.quantity,
          referenceType: StockReferenceType.ADJUSTMENT,
          referenceId: String(sale.invoiceNumber),
          notes: `Retour sur facture #${sale.invoiceNumber}${l.serial ? ` — N° série ${l.serial}` : ''}`,
        });
      }
      createdReturns.push(
        await returnModel.create({
          saleId: sale._id,
          productId: new Types.ObjectId(l.item.productId),
          quantity: l.item.quantity,
          reason: dto.reason || (sale.saleType === SaleType.RESELLER ? 'Retour revendeur' : 'Retour'),
          returnDate: new Date(),
        }),
      );
    }

    // 4. Argent : la valeur retournée réduit la dette, le surplus (déjà payé) est remboursé
    const value = lines.reduce((n, l) => n + l.value, 0);
    const debtReduction = Math.min(value, sale.amountDue || 0);
    const refundDue = value - debtReduction;
    const soldQty = sale.items.reduce((n: number, i: any) => n + i.quantity, 0);
    const returnedQty = [...returned.values(), ...asked.values()].reduce((n, q) => n + q, 0);
    const amountDue = (sale.amountDue || 0) - debtReduction;
    await saleModel.updateOne(
      { _id: sale._id },
      {
        $inc: { amountDue: -debtReduction, returnedAmount: value },
        $set: {
          returnStatus: returnedQty >= soldQty ? 'returned' : 'partial',
          returnDate: new Date(),
          paymentStatus: paymentStatusOf(sale.total - (sale.creditNoteAmount || 0), amountDue),
        },
      },
    );
    let refunded = 0;
    if (sale.customerId) {
      await custModel.updateOne({ _id: sale.customerId }, { $inc: { balance: -debtReduction, totalPurchases: -value } });
      if (refundDue > 0 && dto.refundMethod && dto.refundMethod !== 'none') {
        // Remboursement sorti de la caisse de celui qui fait le retour (montant négatif)
        const customer = await custModel.findById(sale.customerId);
        await this.getPaymentModel(db).create({
          customerId: sale.customerId,
          customerName: customer?.name || null,
          amount: -refundDue,
          method: dto.refundMethod,
          kind: 'refund',
          allocations: [{ saleId: sale._id, invoiceNumber: sale.invoiceNumber, amount: -refundDue }],
          notes: `Remboursement retour facture #${sale.invoiceNumber}`,
          collectedBy: actor ? new Types.ObjectId(actor.userId) : null,
          collectedByName: actor?.name || null,
          closingId: null,
        });
        refunded = refundDue;
      }
    }

    this.notifications.invalidate(db, ['sales', 'units', 'products', 'stock', 'dashboard', 'my-stats', 'customers', 'cash-closings']);
    const parts = [`Retour enregistré : ${fmt(value)} de marchandise remise en stock.`];
    if (debtReduction) parts.push(`Reste à payer réduit de ${fmt(debtReduction)}.`);
    if (refunded) parts.push(`${fmt(refunded)} remboursé(s).`);
    else if (refundDue) parts.push(`${fmt(refundDue)} déjà payé(s) à rembourser au client.`);
    return { message: parts.join(' '), returns: createdReturns, value, debtReduction, refundDue, refunded };
  }
}
