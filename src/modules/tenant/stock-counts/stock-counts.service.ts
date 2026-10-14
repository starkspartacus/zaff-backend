import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { nextSequence } from '../common/sequence';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { Actor, normalizeSerial } from '../sales/sales.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockCount, StockCountSchema } from './stock-count.schema';

const label = (p: any) => (p ? [p.name, p.model].filter(Boolean).join(' ') : 'Article supprimé');
const sum = (entries: Array<{ productId: string; qty: number }>, pid: string) =>
  entries.filter((e) => e.productId === pid).reduce((a, e) => a + e.qty, 0);

/** Pourquoi un appareil scanné ne devrait pas être en boutique */
function unexpectedReason(u: any, startedAt: Date) {
  switch (u.status) {
    case UnitStatus.SOLD:
      return u.soldAt && new Date(u.soldAt) > new Date(startedAt)
        ? 'Vendu pendant l\'inventaire'
        : `Enregistré comme vendu${u.invoiceNumber ? ` (facture #${u.invoiceNumber})` : ''} : il ne devrait plus être en boutique`;
    case UnitStatus.CONSIGNED:
      return `Enregistré en dépôt chez ${u.consignedToName || 'un revendeur'}`;
    case UnitStatus.DEFECTIVE:
      return 'Enregistré comme défectueux (hors stock)';
    case UnitStatus.IN_REPAIR:
      return 'Appareil d\'un client en réparation (hors stock)';
    default:
      return `Statut « ${u.status} »`;
  }
}

@Injectable()
export class StockCountsService {
  constructor(
    private readonly tenants: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private model(db: string) { return this.tenants.getModel<StockCount>(db, StockCount.name, StockCountSchema); }
  private products(db: string) { return this.tenants.getModel<Product>(db, Product.name, ProductSchema); }
  private units(db: string) { return this.tenants.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private movements(db: string) { return this.tenants.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private counters(db: string) { return this.tenants.getModel<Counter>(db, Counter.name, CounterSchema); }

  private scopeQuery(category: string | null) {
    return category ? { category } : {};
  }

  async start(db: string, category: string | null | undefined, actor: Actor) {
    const open = await this.model(db).findOne({ status: 'open' }).lean().exec();
    if (open) throw new ConflictException(`L'inventaire ${open.code} est déjà en cours : terminez-le ou annulez-le d'abord.`);
    const cat = category?.trim() || null;
    const plain = await this.products(db).find({ ...this.scopeQuery(cat), hasSerialNumbers: { $ne: true } }).lean().exec();
    const number = await nextSequence(this.counters(db), 'stock_count', async () => 0);
    const created = await this.model(db).create({
      number,
      code: `INV-${number}`,
      category: cat,
      status: 'open',
      startedBy: new Types.ObjectId(actor.userId),
      startedByName: actor.name,
      startedAt: new Date(),
      serials: [],
      entries: [],
      unknownCodes: [],
      scannedBy: [],
      snapshot: plain.map((p: any) => ({ productId: String(p._id), productName: label(p), expected: p.stockQuantity || 0 })),
    });
    this.notifications.invalidate(db, ['stock-counts']);
    return this.get(db, String(created._id));
  }

  async current(db: string) {
    const open = await this.model(db).findOne({ status: 'open' }).lean().exec();
    return open ? this.get(db, String(open._id)) : null;
  }

  async list(db: string) {
    return this.model(db).find({ status: { $ne: 'open' } }).sort({ startedAt: -1 }).limit(50).select('-serials -entries -snapshot').lean().exec();
  }

  /** Session avec l'avancement en direct (appareils attendus / trouvés, accessoires comptés) */
  async get(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Inventaire introuvable.');
    const c: any = await this.model(db).findById(id).lean().exec();
    if (!c) throw new NotFoundException('Inventaire introuvable.');
    if (c.status !== 'open') return c;
    const serialProducts = await this.products(db).find({ ...this.scopeQuery(c.category), hasSerialNumbers: true }).lean().exec();
    const ids = serialProducts.map((p: any) => p._id);
    const inStock = await this.units(db).find({ productId: { $in: ids }, status: UnitStatus.IN_STOCK }).lean().exec();
    const scanned = new Set<string>(c.serials || []);
    const byProduct = serialProducts
      .map((p: any) => {
        const mine = inStock.filter((u: any) => String(u.productId) === String(p._id));
        return { productId: String(p._id), productName: label(p), expected: mine.length, found: mine.filter((u: any) => scanned.has(u.serialNumber)).length };
      })
      .filter((r) => r.expected > 0);
    const entries = c.entries || [];
    return {
      ...c,
      serials: undefined,
      entries: undefined,
      progress: {
        expectedUnits: inStock.length,
        foundUnits: inStock.filter((u: any) => scanned.has(u.serialNumber)).length,
        scannedCodes: scanned.size,
        byProduct,
        plain: (c.snapshot || []).map((s: any) => {
          const touched = entries.some((e: any) => e.productId === s.productId);
          return { ...s, counted: touched ? sum(entries, s.productId) : null };
        }),
      },
    };
  }

  private async openOrThrow(db: string, id: string) {
    const c: any = await this.model(db).findById(id).lean().exec();
    if (!c) throw new NotFoundException('Inventaire introuvable.');
    if (c.status !== 'open') throw new BadRequestException(`L'inventaire ${c.code} est terminé.`);
    return c;
  }

  /** Un scan : N° de série d'un appareil, ou code-barres d'un produit sans N° de série (+1) */
  async scan(db: string, id: string, rawCode: string, actor: Actor) {
    const c = await this.openOrThrow(db, id);
    const code = normalizeSerial(rawCode || '');
    if (!code) throw new BadRequestException('Code vide.');
    const markScanner = { $addToSet: { scannedBy: actor.name } };

    const unit: any = await this.units(db).findOne({ serialNumber: code }).populate('productId').lean().exec();
    if (unit) {
      const product: any = unit.productId;
      const productName = label(product);
      if (c.category && product?.category !== c.category) {
        return { kind: 'unit', result: 'other_category', serialNumber: code, productName, message: `${productName} n'est pas dans la catégorie inventoriée (${c.category}).` };
      }
      const res = await this.model(db).findOneAndUpdate(
        { _id: c._id, status: 'open', serials: { $nin: [code] } },
        { $push: { serials: code }, ...markScanner },
        { new: true },
      );
      if (!res) {
        const still = await this.model(db).findById(c._id).lean().exec();
        if (still?.status !== 'open') throw new BadRequestException(`L'inventaire ${c.code} est terminé.`);
        return { kind: 'unit', result: 'already', serialNumber: code, productName, message: 'Déjà compté.' };
      }
      this.notifications.invalidate(db, ['stock-counts']);
      if (unit.status === UnitStatus.IN_STOCK) return { kind: 'unit', result: 'found', serialNumber: code, productName, message: 'En stock : compté.' };
      return { kind: 'unit', result: 'unexpected', serialNumber: code, productName, message: unexpectedReason(unit, c.startedAt) };
    }

    const product: any = await this.products(db).findOne({ $or: [{ barcode: code }, { sku: code }] }).lean().exec();
    if (product) {
      if (product.hasSerialNumbers) {
        return { kind: 'box', productName: label(product), message: `C'est le code-barres de la boîte. Scannez le N° de série / IMEI de chaque ${label(product)}.` };
      }
      return this.count(db, id, String(product._id), 1, actor);
    }

    await this.model(db).updateOne({ _id: c._id, status: 'open' }, { $addToSet: { unknownCodes: code } });
    this.notifications.invalidate(db, ['stock-counts']);
    return { kind: 'unknown', serialNumber: code, message: 'Code inconnu : cet appareil n\'est pas enregistré dans la boutique. Mettez-le de côté.' };
  }

  /** Ajout ou correction de la quantité comptée d'un produit sans N° de série */
  async count(db: string, id: string, productId: string, qty: number, actor: Actor) {
    const c = await this.openOrThrow(db, id);
    const snap = (c.snapshot || []).find((s: any) => s.productId === productId);
    if (!snap) throw new BadRequestException('Ce produit n\'est pas dans cet inventaire (catégorie différente, ou suivi par N° de série).');
    const current = sum(c.entries || [], productId);
    if (current + qty < 0) throw new BadRequestException('La quantité comptée ne peut pas être négative.');
    const res = await this.model(db).findOneAndUpdate(
      { _id: c._id, status: 'open' },
      { $push: { entries: { productId, qty, byName: actor.name, at: new Date() } }, $addToSet: { scannedBy: actor.name } },
      { new: true },
    );
    if (!res) throw new BadRequestException(`L'inventaire ${c.code} est terminé.`);
    this.notifications.invalidate(db, ['stock-counts']);
    return { kind: 'product', result: 'counted', productId, productName: snap.productName, counted: sum((res as any).entries || [], productId), message: `${snap.productName} : ${sum((res as any).entries || [], productId)} compté(s).` };
  }

  /**
   * Clôture : rapport (trouvés, manquants, inattendus, inconnus) et, si demandé, stock des produits sans N° de série
   * corrigé de l'écart compté − attendu au démarrage ($inc : les ventes faites pendant le comptage restent comptées).
   * Les appareils manquants ne changent pas de statut : à vérifier par le propriétaire.
   */
  async close(db: string, id: string, applyAdjustments: boolean, actor: Actor) {
    const locked: any = await this.model(db).findOneAndUpdate({ _id: new Types.ObjectId(id), status: 'open' }, { $set: { status: 'closing' } }, { new: true }).lean().exec();
    if (!locked) {
      const c = await this.model(db).findById(id).lean().exec();
      if (!c) throw new NotFoundException('Inventaire introuvable.');
      throw new BadRequestException(`L'inventaire ${c.code} est déjà terminé.`);
    }
    try {
      const serialProducts = await this.products(db).find({ ...this.scopeQuery(locked.category), hasSerialNumbers: true }).lean().exec();
      const nameOf = new Map(serialProducts.map((p: any) => [String(p._id), label(p)]));
      const priceOf = new Map(serialProducts.map((p: any) => [String(p._id), p.purchasePrice || 0]));
      const inStock = await this.units(db).find({ productId: { $in: serialProducts.map((p: any) => p._id) }, status: UnitStatus.IN_STOCK }).lean().exec();
      const scanned = new Set<string>(locked.serials || []);
      const missing = inStock
        .filter((u: any) => !scanned.has(u.serialNumber))
        .map((u: any) => ({ unitId: String(u._id), serialNumber: u.serialNumber, productId: String(u.productId), productName: nameOf.get(String(u.productId)) || '', addedAt: u.createdAt || null, value: priceOf.get(String(u.productId)) || 0 }));
      const others = await this.units(db).find({ serialNumber: { $in: [...scanned] }, status: { $ne: UnitStatus.IN_STOCK } }).populate('productId').lean().exec();
      const unexpected = others.map((u: any) => ({
        serialNumber: u.serialNumber,
        productName: label(u.productId),
        status: u.status,
        reason: unexpectedReason(u, locked.startedAt),
        duringCount: u.status === UnitStatus.SOLD && !!u.soldAt && new Date(u.soldAt) > new Date(locked.startedAt),
      }));

      const entries = locked.entries || [];
      const plain: any[] = [];
      for (const s of locked.snapshot || []) {
        if (!entries.some((e: any) => e.productId === s.productId)) {
          plain.push({ ...s, counted: null, difference: null, applied: false });
          continue;
        }
        const counted = sum(entries, s.productId);
        const difference = counted - s.expected;
        let applied = false;
        if (applyAdjustments && difference !== 0) {
          const pid = new Types.ObjectId(s.productId);
          let updated = await this.products(db).findOneAndUpdate(
            { _id: pid, stockQuantity: { $gte: Math.max(0, -difference) } },
            { $inc: { stockQuantity: difference } },
            { new: true },
          );
          if (!updated) updated = await this.products(db).findOneAndUpdate({ _id: pid }, { $set: { stockQuantity: 0 } }, { new: true });
          if (updated) {
            applied = true;
            await this.movements(db).create({
              productId: pid,
              movementType: StockMovementType.ADJUSTMENT,
              quantity: Math.abs(difference),
              referenceType: StockReferenceType.ADJUSTMENT,
              referenceId: String(locked._id),
              notes: `Inventaire ${locked.code} par ${actor.name} : compté ${counted}, attendu ${s.expected} (écart ${difference > 0 ? '+' : ''}${difference})`,
            });
          }
        }
        plain.push({ ...s, counted, difference, applied });
      }

      const report = {
        expectedUnits: inStock.length,
        foundUnits: inStock.length - missing.length,
        missing,
        missingValue: missing.reduce((a, m) => a + m.value, 0),
        unexpected,
        unknownCodes: locked.unknownCodes || [],
        plain,
        adjustedProducts: plain.filter((p) => p.applied).length,
        notCounted: plain.filter((p) => p.counted === null).length,
      };
      await this.model(db).updateOne(
        { _id: locked._id },
        { $set: { status: 'closed', closedAt: new Date(), closedByName: actor.name, report } },
      );

      const anomalies = missing.length + unexpected.filter((u) => !u.duringCount).length + report.unknownCodes.length;
      await this.notifications.notify(db, {
        type: 'stock.count.closed',
        title: `Inventaire ${locked.code} terminé`,
        message: anomalies
          ? `${actor.name} a terminé l'inventaire : ${missing.length} appareil(s) manquant(s), ${unexpected.filter((u) => !u.duringCount).length} inattendu(s), ${report.unknownCodes.length} code(s) inconnu(s).`
          : `${actor.name} a terminé l'inventaire : tout est en ordre (${report.foundUnits} appareil(s) trouvés).`,
        level: missing.length ? 'warning' : 'success',
        roles: ['admin'],
        actorId: actor.userId,
        data: { countId: String(locked._id), missing: missing.length },
      });
      this.notifications.invalidate(db, ['stock-counts', 'products', 'stock', 'dashboard']);
      return this.model(db).findById(locked._id).lean().exec();
    } catch (e) {
      await this.model(db).updateOne({ _id: locked._id, status: 'closing' }, { $set: { status: 'open' } });
      throw e;
    }
  }

  async cancel(db: string, id: string) {
    const res = await this.model(db).findOneAndUpdate({ _id: new Types.ObjectId(id), status: 'open' }, { $set: { status: 'cancelled', closedAt: new Date() } }, { new: true });
    if (!res) throw new BadRequestException('Cet inventaire n\'est plus en cours.');
    this.notifications.invalidate(db, ['stock-counts']);
    return res;
  }
}
