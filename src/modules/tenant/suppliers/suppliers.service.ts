import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Supplier, SupplierSchema } from '../common/schemas/supplier.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../common/schemas/purchase-order.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { nextSequence } from '../common/sequence';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { PurchaseOrderStatus } from '../../../common/enums/purchase-order-status.enum';
import { toE164 } from '../../../common/geo/geo';
import { Actor } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { ReceptionsService } from '../units/receptions/receptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreatePurchaseOrderDto, CreateSupplierDto, ReceivePurchaseOrderDto, SupplierPaymentDto, UpdateSupplierDto,
} from './dto/create-supplier.dto';

const OPEN = [PurchaseOrderStatus.PENDING, PurchaseOrderStatus.PARTIAL];
const round = (n: number) => Math.round(n * 100) / 100;
/** Verrou optimiste ; les anciennes commandes n'ont pas encore de champ version */
const atVersion = (v?: number) => (v ? { version: v } : { $or: [{ version: 0 }, { version: null }] });

@Injectable()
export class SuppliersService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly units: UnitsService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly receptions?: ReceptionsService,
  ) {}

  private getSupplierModel(db: string) { return this.tenantConnectionService.getModel<Supplier>(db, Supplier.name, SupplierSchema); }
  private getOrderModel(db: string) { return this.tenantConnectionService.getModel<PurchaseOrder>(db, PurchaseOrder.name, PurchaseOrderSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private counters(db: string) { return this.tenantConnectionService.getModel<Counter>(db, Counter.name, CounterSchema); }

  private phoneOf(raw: string | undefined | null, country?: string | null) {
    if (!raw?.trim()) return null;
    const e164 = toE164(raw, country);
    if (!e164) throw new BadRequestException(`Le numéro du fournisseur « ${raw} » n'est pas valide.`);
    return e164;
  }

  // ─── Fournisseurs ────────────────────────────────────────────────────────
  /** Fournisseurs avec ce qu'on leur doit et les commandes en cours */
  async getSuppliers(db: string) {
    const [suppliers, orders] = await Promise.all([
      this.getSupplierModel(db).find().sort({ name: 1 }).lean().exec(),
      this.getOrderModel(db).find({ status: { $ne: PurchaseOrderStatus.CANCELLED } }).lean().exec(),
    ]);
    return suppliers.map((s: any) => {
      const mine = orders.filter((o: any) => String(o.supplierId) === String(s._id));
      return {
        ...s,
        ordersCount: mine.length,
        openOrders: mine.filter((o: any) => OPEN.includes(o.status)).length,
        amountDue: round(mine.reduce((a: number, o: any) => a + (o.amountDue || 0), 0)),
        totalPurchased: round(mine.reduce((a: number, o: any) => a + (o.totalAmount || 0), 0)),
      };
    });
  }

  async createSupplier(db: string, dto: CreateSupplierDto, country?: string | null) {
    return this.getSupplierModel(db).create({ ...dto, phone: this.phoneOf(dto.phone, country) });
  }

  async updateSupplier(db: string, id: string, dto: UpdateSupplierDto, country?: string | null) {
    const update: any = { ...dto };
    if (dto.phone !== undefined) update.phone = this.phoneOf(dto.phone, country);
    const res = await this.getSupplierModel(db).findByIdAndUpdate(id, update, { new: true }).exec();
    if (!res) throw new NotFoundException('Fournisseur non trouvé.');
    if (dto.name) await this.getOrderModel(db).updateMany({ supplierId: res._id }, { $set: { supplierName: res.name } });
    return res;
  }

  async deleteSupplier(db: string, id: string) {
    const used = await this.getOrderModel(db).countDocuments({ supplierId: new Types.ObjectId(id) });
    if (used) throw new ConflictException('Ce fournisseur a des commandes : il ne peut pas être supprimé.');
    const res = await this.getSupplierModel(db).findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Fournisseur non trouvé.');
    return { deleted: true };
  }

  // ─── Commandes ───────────────────────────────────────────────────────────
  async getOrders(db: string, filter: { status?: string; supplierId?: string } = {}) {
    const q: any = {};
    if (filter.status === 'open') q.status = { $in: OPEN };
    else if (filter.status === 'closed') q.status = { $nin: OPEN };
    else if (filter.status === 'unpaid') q.amountDue = { $gt: 0 };
    if (filter.supplierId) q.supplierId = new Types.ObjectId(filter.supplierId);
    const orders = await this.getOrderModel(db).find(q).sort({ orderDate: -1 }).limit(300).lean().exec();
    return orders.map((o) => this.withState(o));
  }

  async getOrder(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Commande non trouvée.');
    let order = await this.getOrderModel(db).findById(id).lean().exec();
    if (!order) throw new NotFoundException('Commande non trouvée.');
    if (order.amountDue === undefined || !order.code || order.version === undefined) {
      await this.upgrade(db, order);
      order = (await this.getOrderModel(db).findById(id).lean().exec())!;
    }
    const supplier = await this.getSupplierModel(db).findById(order.supplierId).lean().exec();
    return { ...this.withState(order), supplier };
  }

  /** Champs calculés pour l'écran (en retard, reste à recevoir) ; anciennes commandes complétées */
  private withState(raw: any) {
    const o = { ...raw, ...this.legacyFields(raw) };
    const remaining = (o.items || []).reduce((a: number, i: any) => a + Math.max(0, i.quantity - (i.receivedQty || 0)), 0);
    const late = OPEN.includes(o.status) && !!o.expectedAt && new Date(o.expectedAt).getTime() < Date.now();
    return { ...o, remaining, late };
  }

  /** Commandes de l'ancien module (sans code, reste à payer ni quantités reçues) */
  private legacyFields(o: any) {
    const paid = o.paidAmount || 0;
    return {
      code: o.code || `BC-${String(o._id).slice(-6).toUpperCase()}`,
      supplierName: o.supplierName || '',
      paidAmount: paid,
      amountDue: o.amountDue ?? (o.status === PurchaseOrderStatus.CANCELLED ? 0 : round(Math.max(0, (o.totalAmount || 0) - paid))),
      payments: o.payments || [],
      receptions: o.receptions || [],
      items: (o.items || []).map((i: any) => ({
        ...i,
        productName: i.productName || '',
        receivedQty: i.receivedQty ?? (o.status === PurchaseOrderStatus.RECEIVED ? i.quantity : 0),
      })),
    };
  }

  /** Écrit une fois les champs manquants d'une ancienne commande (avant une écriture atomique) */
  private async upgrade(db: string, raw: any) {
    if (raw.amountDue !== undefined && raw.code && raw.items?.every((i: any) => i.receivedQty !== undefined)) return;
    const f = this.legacyFields(raw);
    if (!raw.supplierName) {
      const s = await this.getSupplierModel(db).findById(raw.supplierId).lean().exec();
      f.supplierName = s?.name || '';
    }
    for (const i of f.items) {
      if (!i.productName) {
        const p: any = await this.getProductModel(db).findById(i.productId).lean().exec();
        i.productName = p ? [p.name, p.model].filter(Boolean).join(' ') : 'Article supprimé';
        i.hasSerialNumbers = !!p?.hasSerialNumbers;
      }
    }
    await this.getOrderModel(db).updateOne({ _id: raw._id }, { $set: { ...f, version: raw.version || 0 } });
  }

  /** Le serveur fixe les prix (prix d'achat du catalogue par défaut) et les totaux */
  async createOrder(db: string, dto: CreatePurchaseOrderDto, actor: Actor) {
    if (!Types.ObjectId.isValid(dto.supplierId)) throw new BadRequestException('Choisissez un fournisseur.');
    const supplier = await this.getSupplierModel(db).findById(dto.supplierId).lean().exec();
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé.');

    const lines = new Map<string, { quantity: number; unitPrice?: number }>();
    for (const l of dto.items) {
      const prev = lines.get(l.productId);
      lines.set(l.productId, { quantity: (prev?.quantity || 0) + l.quantity, unitPrice: l.unitPrice ?? prev?.unitPrice });
    }
    const ids = [...lines.keys()];
    if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new BadRequestException('Un article de la commande est inconnu.');
    const products = await this.getProductModel(db).find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).lean().exec();
    const items = ids.map((id) => {
      const p: any = products.find((x: any) => String(x._id) === id);
      if (!p) throw new BadRequestException('Un article de la commande n\'existe plus dans le catalogue.');
      const l = lines.get(id)!;
      const unitPrice = round(l.unitPrice ?? p.purchasePrice ?? 0);
      return {
        productId: p._id,
        productName: [p.name, p.model].filter(Boolean).join(' '),
        hasSerialNumbers: !!p.hasSerialNumbers,
        quantity: l.quantity,
        receivedQty: 0,
        unitPrice,
        total: round(unitPrice * l.quantity),
      };
    });
    const totalAmount = round(items.reduce((a, i) => a + i.total, 0));
    const number = await nextSequence(this.counters(db), 'purchase_order', async () => 1000);
    const order = await this.getOrderModel(db).create({
      number,
      code: `BC-${number}`,
      supplierId: supplier._id,
      supplierName: supplier.name,
      expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
      status: PurchaseOrderStatus.PENDING,
      totalAmount,
      paidAmount: 0,
      amountDue: totalAmount,
      items,
      createdByName: actor.name,
      notes: dto.notes || null,
    });
    return this.getOrder(db, String(order._id));
  }

  /**
   * Réception (totale ou partielle). Produit sans N° de série : `$inc` atomique du stock.
   * Produit suivi : chaque N° de série passe par la mise en stock (contrôle des doublons) — seuls les appareils
   * acceptés comptent. La commande est mise à jour avec un verrou optimiste (deux réceptions simultanées s'additionnent).
   */
  async receive(db: string, id: string, dto: ReceivePurchaseOrderDto, actor: Actor) {
    const order = await this.getOrder(db, id);
    if (!OPEN.includes(order.status)) {
      throw new BadRequestException(order.status === PurchaseOrderStatus.CANCELLED ? 'Cette commande est annulée.' : 'Cette commande est déjà entièrement reçue.');
    }
    const label = `Commande ${order.code} (${order.supplierName})`;
    const results: Array<{ productId: string; productName: string; received: number; serials?: string[]; rejected: Array<{ serialNumber: string; reason: string }> }> = [];
    const prodModel = this.getProductModel(db);

    for (const line of dto.items) {
      const item = order.items.find((i: any) => String(i.productId) === line.productId);
      if (!item) throw new BadRequestException('Cet article ne fait pas partie de la commande.');
      if (item.hasSerialNumbers) {
        const serials = (line.serialNumbers || []).filter((s) => s?.trim());
        if (!serials.length) continue;
        const r = await this.units.addUnits(db, { productId: line.productId, serialNumbers: serials, notes: label }, actor, { id: String(order._id), label, silent: true });
        results.push({ productId: line.productId, productName: item.productName, received: r.created.length, serials: r.created.map((u: any) => u.serialNumber), rejected: r.rejected });
      } else {
        if (line.serialNumbers?.length) throw new BadRequestException(`« ${item.productName} » n'est pas suivi par N° de série : indiquez une quantité.`);
        const qty = line.quantity || 0;
        if (!qty) continue;
        const updated = await prodModel.findByIdAndUpdate(item.productId, { $inc: { stockQuantity: qty } }, { new: true });
        if (!updated) throw new BadRequestException(`« ${item.productName} » n'existe plus dans le catalogue.`);
        await this.getStockMovementModel(db).create({
          productId: item.productId,
          movementType: StockMovementType.IN,
          quantity: qty,
          referenceType: StockReferenceType.PURCHASE,
          referenceId: String(order._id),
          notes: `${label} — reçu par ${actor.name}`,
        });
        results.push({ productId: line.productId, productName: item.productName, received: qty, rejected: [] });
      }
    }

    const got = results.filter((r) => r.received > 0);
    if (!got.length) {
      return { order, results, received: 0 };
    }

    // Prix d'achat du catalogue = dernier prix payé au fournisseur
    if (dto.updatePurchasePrice !== false) {
      for (const r of got) {
        const item = order.items.find((i: any) => String(i.productId) === r.productId)!;
        if (item.unitPrice > 0) await prodModel.updateOne({ _id: item.productId }, { $set: { purchasePrice: item.unitPrice } });
      }
    }

    const orderModel = this.getOrderModel(db);
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur: any = await orderModel.findById(id).lean().exec();
      const items = cur.items.map((i: any) => {
        const r = got.find((g) => g.productId === String(i.productId));
        return r ? { ...i, receivedQty: (i.receivedQty || 0) + r.received } : i;
      });
      const complete = items.every((i: any) => i.receivedQty >= i.quantity);
      const res = await orderModel.findOneAndUpdate(
        { _id: cur._id, ...atVersion(cur.version) },
        {
          $set: {
            items,
            status: complete ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIAL,
            closedAt: complete ? new Date() : null,
          },
          $inc: { version: 1 },
          $push: {
            receptions: {
              at: new Date(),
              byName: actor.name,
              lines: got.map((g) => ({ productId: g.productId, productName: g.productName, quantity: g.received })),
            },
          },
        },
        { new: true },
      );
      if (res) break;
      if (attempt === 4) throw new ConflictException('La commande est modifiée par un autre poste : réessayez.');
    }

    const count = got.reduce((a, r) => a + r.received, 0);
    // Journal des ravitaillements : la livraison fournisseur y figure comme une réception
    await this.receptions
      ?.record(
        db,
        {
          source: 'purchase_order',
          orderId: String(order._id),
          orderCode: order.code,
          supplierName: order.supplierName,
          lines: got.map((g) => ({
            productId: g.productId,
            quantity: g.received,
            serialNumbers: g.serials || [],
            unitCost: order.items.find((i: any) => String(i.productId) === g.productId)?.unitPrice,
          })),
        },
        actor,
        false,
      )
      .catch(() => undefined);
    await this.notifications.notify(db, {
      type: 'purchase.received',
      title: 'Livraison fournisseur reçue',
      message: `${actor.name} a réceptionné ${count} article(s) de la commande ${order.code} (${order.supplierName})`,
      level: 'success',
      roles: ['admin', 'storekeeper'],
      actorId: actor.userId,
      data: { orderId: String(order._id), code: order.code, count },
    });
    this.notifications.invalidate(db, ['suppliers', 'products', 'units', 'stock', 'dashboard']);
    return { order: await this.getOrder(db, id), results, received: count };
  }

  /** Solder une commande partiellement reçue : le reliquat est abandonné, la dette ramenée à ce qui a été reçu */
  async close(db: string, id: string) {
    const order = await this.getOrder(db, id);
    if (!OPEN.includes(order.status)) throw new BadRequestException('Cette commande est déjà terminée.');
    const received = round(order.items.reduce((a: number, i: any) => a + (i.receivedQty || 0) * i.unitPrice, 0));
    const nothing = order.items.every((i: any) => !i.receivedQty);
    if (nothing && order.paidAmount > 0) throw new BadRequestException('Rien n\'a été reçu mais un paiement a été fait : réglez cela avec le fournisseur avant d\'annuler.');
    const res = await this.getOrderModel(db).findOneAndUpdate(
      { _id: order._id, ...atVersion(order.version) },
      {
        $set: {
          status: nothing ? PurchaseOrderStatus.CANCELLED : PurchaseOrderStatus.RECEIVED,
          totalAmount: received,
          amountDue: round(Math.max(0, received - (order.paidAmount || 0))),
          closedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!res) throw new ConflictException('La commande vient d\'être modifiée : réessayez.');
    return this.getOrder(db, id);
  }

  async cancel(db: string, id: string) {
    const order = await this.getOrder(db, id);
    if (order.status !== PurchaseOrderStatus.PENDING) throw new BadRequestException('Une commande déjà (partiellement) reçue ne peut pas être annulée : soldez-la.');
    if (order.paidAmount > 0) throw new BadRequestException('Un paiement a déjà été fait au fournisseur pour cette commande.');
    const res = await this.getOrderModel(db).findOneAndUpdate(
      { _id: order._id, status: PurchaseOrderStatus.PENDING, ...atVersion(order.version) },
      { $set: { status: PurchaseOrderStatus.CANCELLED, amountDue: 0, closedAt: new Date() }, $inc: { version: 1 } },
      { new: true },
    );
    if (!res) throw new ConflictException('La commande vient d\'être modifiée : réessayez.');
    return this.getOrder(db, id);
  }

  /** Paiement au fournisseur : débit atomique du reste à payer, jamais plus que ce qui est dû */
  async pay(db: string, id: string, dto: SupplierPaymentDto, actor: Actor) {
    const order = await this.getOrder(db, id);
    if (order.status === PurchaseOrderStatus.CANCELLED) throw new BadRequestException('Cette commande est annulée.');
    const amount = round(dto.amount);
    const res = await this.getOrderModel(db).findOneAndUpdate(
      { _id: order._id, amountDue: { $gte: amount } },
      {
        $inc: { amountDue: -amount, paidAmount: amount },
        $push: { payments: { at: new Date(), amount, method: dto.method || 'cash', byName: actor.name, note: dto.note || null } },
      },
      { new: true },
    );
    if (!res) throw new BadRequestException(`Le montant dépasse ce qui reste à payer (${order.amountDue}).`);
    this.notifications.invalidate(db, ['suppliers']);
    return this.getOrder(db, id);
  }

  /** Articles à recommander : stock au niveau d'alerte ou en dessous, avec le dernier fournisseur et prix */
  async suggestions(db: string) {
    const [products, orders] = await Promise.all([
      this.getProductModel(db).find({ minStockAlert: { $gt: 0 } }).lean().exec(),
      this.getOrderModel(db).find({ status: { $ne: PurchaseOrderStatus.CANCELLED } }).sort({ orderDate: -1 }).limit(500).lean().exec(),
    ]);
    const pendingQty = (pid: string) =>
      orders.filter((o: any) => OPEN.includes(o.status)).reduce((a: number, o: any) => a + o.items.filter((i: any) => String(i.productId) === pid).reduce((b: number, i: any) => b + Math.max(0, i.quantity - (i.receivedQty || 0)), 0), 0);
    return products
      .filter((p: any) => (p.stockQuantity || 0) <= p.minStockAlert)
      .map((p: any) => {
        const pid = String(p._id);
        const last: any = orders.find((o: any) => o.items.some((i: any) => String(i.productId) === pid));
        const lastItem = last?.items.find((i: any) => String(i.productId) === pid);
        const onOrder = pendingQty(pid);
        return {
          productId: pid,
          productName: [p.name, p.model].filter(Boolean).join(' '),
          hasSerialNumbers: !!p.hasSerialNumbers,
          stockQuantity: p.stockQuantity || 0,
          minStockAlert: p.minStockAlert,
          onOrder,
          suggestedQty: Math.max(0, p.minStockAlert * 2 - (p.stockQuantity || 0) - onOrder),
          lastSupplierId: last ? String(last.supplierId) : null,
          lastSupplierName: last?.supplierName || null,
          lastUnitPrice: lastItem?.unitPrice ?? p.purchasePrice ?? 0,
        };
      })
      .filter((s) => s.suggestedQty > 0)
      .sort((a, b) => a.stockQuantity - b.stockQuantity);
  }

  async summary(db: string) {
    const orders = await this.getOrderModel(db).find({ status: { $ne: PurchaseOrderStatus.CANCELLED } }).lean().exec();
    const open = orders.filter((o: any) => OPEN.includes(o.status)).map((o) => this.withState(o));
    return {
      openOrders: open.length,
      lateOrders: open.filter((o) => o.late).length,
      amountDue: round(orders.reduce((a: number, o: any) => a + (o.amountDue || 0), 0)),
      toReceive: open.reduce((a, o) => a + o.remaining, 0),
    };
  }
}
