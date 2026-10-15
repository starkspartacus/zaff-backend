import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../../database/tenant-connection.service';
import { Product, ProductSchema } from '../../common/schemas/product.schema';
import { Category, CategorySchema } from '../../common/schemas/category.schema';
import { Counter, CounterSchema } from '../../common/schemas/counter.schema';
import { nextSequence } from '../../common/sequence';
import { Actor } from '../../sales/sales.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UnitsService } from '../units.service';
import { StockReception, StockReceptionSchema } from './stock-reception.schema';

export interface ReceptionLineInput {
  productId: string;
  quantity: number;
  serialNumbers?: string[];
  unitCost?: number;
}

const labelOf = (p: any) => [p.name, p.model, p.color].filter(Boolean).join(' · ');
const pretty = (slug: string) => (slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ') : 'Sans catégorie');

/**
 * Ravitaillements de la boutique : chaque réception (scan en rafale ou commande fournisseur) est gardée avec
 * qui, quand, quoi (par catégorie → modèle → N° de série), combien et pour quelle valeur d'achat.
 */
@Injectable()
export class ReceptionsService {
  constructor(
    private readonly tenants: TenantConnectionService,
    private readonly units: UnitsService,
    private readonly notifications: NotificationsService,
  ) {}

  private model(db: string) { return this.tenants.getModel<StockReception>(db, StockReception.name, StockReceptionSchema); }
  private products(db: string) { return this.tenants.getModel<Product>(db, Product.name, ProductSchema); }
  private categories(db: string) { return this.tenants.getModel<Category>(db, Category.name, CategorySchema); }
  private counters(db: string) { return this.tenants.getModel<Counter>(db, Counter.name, CounterSchema); }

  private async reserveCode(db: string) {
    const number = await nextSequence(this.counters(db), 'stock_reception', async () => 0);
    return { number, code: `REC-${number}` };
  }

  /** Mise en stock en rafale : tous les appareils scannés, tous modèles confondus, en une réception */
  async receiveScanned(db: string, items: Array<{ productId: string; serialNumbers: string[] }>, extra: { note?: string; supplierName?: string }, actor: Actor) {
    const groups = new Map<string, string[]>();
    for (const it of items) {
      if (!Types.ObjectId.isValid(it.productId)) throw new BadRequestException('Un modèle de la réception est inconnu.');
      groups.set(it.productId, [...(groups.get(it.productId) || []), ...(it.serialNumbers || [])]);
    }
    if (![...groups.values()].some((s) => s.length)) throw new BadRequestException('Aucun appareil à mettre en stock.');

    const id = new Types.ObjectId();
    const { number, code } = await this.reserveCode(db);
    const results: Array<{ productId: string; created: string[]; rejected: Array<{ serialNumber: string; reason: string }> }> = [];
    for (const [productId, serials] of groups) {
      try {
        const r = await this.units.addUnits(db, { productId, serialNumbers: serials, notes: `Réception ${code}` }, actor, { id: String(id), label: `Réception ${code}`, silent: true });
        results.push({ productId, created: r.created.map((u: any) => u.serialNumber), rejected: r.rejected });
      } catch (e: any) {
        results.push({ productId, created: [], rejected: serials.map((serialNumber) => ({ serialNumber, reason: e?.message || 'Refusé' })) });
      }
    }
    const lines = results.filter((r) => r.created.length).map((r) => ({ productId: r.productId, quantity: r.created.length, serialNumbers: r.created }));
    const rejected = results.flatMap((r) => r.rejected.map((x) => ({ ...x, productId: r.productId })));
    const reception = lines.length
      ? await this.record(db, { _id: id, number, code, source: 'scan', note: extra.note, supplierName: extra.supplierName, lines, rejected }, actor)
      : null;
    return { reception, results };
  }

  /** Enregistre la réception (utilisé aussi par la réception des commandes fournisseurs) */
  async record(
    db: string,
    r: {
      _id?: Types.ObjectId;
      number?: number;
      code?: string;
      source: 'scan' | 'purchase_order';
      orderId?: string;
      orderCode?: string;
      supplierName?: string | null;
      note?: string | null;
      lines: ReceptionLineInput[];
      rejected?: Array<{ productId: string; serialNumber: string; reason: string }>;
    },
    actor: Actor,
    notify = true,
  ) {
    const ids = [...new Set([...r.lines.map((l) => l.productId), ...(r.rejected || []).map((x) => x.productId)])].filter((x) => Types.ObjectId.isValid(x));
    const products: any[] = await this.products(db).find({ _id: { $in: ids.map((x) => new Types.ObjectId(x)) } }).lean().exec();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const slugs = [...new Set(products.map((p) => p.category).filter(Boolean))];
    const cats: any[] = slugs.length ? await this.categories(db).find({ slug: { $in: slugs } }).lean().exec() : [];
    const catName = (slug: string) => cats.find((c) => c.slug === slug)?.name || pretty(slug);

    const lines = r.lines
      .filter((l) => l.quantity > 0)
      .map((l) => {
        const p = byId.get(l.productId) || {};
        return {
          productId: l.productId,
          productName: labelOf(p) || 'Article supprimé',
          category: p.category || '',
          categoryName: catName(p.category || ''),
          brand: p.brand || null,
          model: p.model || null,
          color: p.color || null,
          quantity: l.quantity,
          serialNumbers: l.serialNumbers || [],
          unitCost: l.unitCost ?? p.purchasePrice ?? 0,
        };
      })
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.productName.localeCompare(b.productName));
    if (!lines.length) return null;
    const byCat = new Map<string, { category: string; categoryName: string; quantity: number }>();
    for (const l of lines) {
      const c = byCat.get(l.category) || { category: l.category, categoryName: l.categoryName, quantity: 0 };
      c.quantity += l.quantity;
      byCat.set(l.category, c);
    }
    const seq = r.number && r.code ? { number: r.number, code: r.code } : await this.reserveCode(db);
    const totalUnits = lines.reduce((a, l) => a + l.quantity, 0);
    const doc = await this.model(db).create({
      _id: r._id || new Types.ObjectId(),
      ...seq,
      source: r.source,
      orderId: r.orderId && Types.ObjectId.isValid(r.orderId) ? new Types.ObjectId(r.orderId) : null,
      orderCode: r.orderCode || null,
      supplierName: r.supplierName || null,
      note: r.note || null,
      receivedBy: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
      receivedByName: actor.name,
      lines,
      rejected: (r.rejected || []).map((x) => ({ productName: labelOf(byId.get(x.productId) || {}) || '—', serialNumber: x.serialNumber, reason: x.reason })),
      totalUnits,
      totalValue: Math.round(lines.reduce((a, l) => a + l.quantity * l.unitCost, 0)),
      byCategory: [...byCat.values()].sort((a, b) => b.quantity - a.quantity),
    });
    const detail = [...byCat.values()].sort((a, b) => b.quantity - a.quantity).map((c) => `${c.categoryName} ${c.quantity}`).join(', ');
    if (notify) await this.notifications.notify(db, {
      type: 'stock.received',
      title: 'Marchandise réceptionnée',
      message: `${actor.name} a réceptionné ${totalUnits} article(s) : ${detail} (${seq.code}${r.orderCode ? ` · commande ${r.orderCode}` : ''})`,
      level: 'info',
      roles: ['admin'],
      actorId: actor.userId,
      data: { receptionId: String(doc._id), code: seq.code, totalUnits },
    });
    this.notifications.invalidate(db, ['receptions', 'units', 'products', 'stock', 'dashboard']);
    return doc.toObject ? doc.toObject() : doc;
  }

  async list(db: string, filter: { from?: string; to?: string; category?: string; limit?: number }) {
    const q: any = {};
    if (filter.from || filter.to) {
      q.createdAt = {};
      if (filter.from) q.createdAt.$gte = new Date(filter.from);
      if (filter.to) q.createdAt.$lte = new Date(filter.to);
    }
    const rows: any[] = await this.model(db).find(q).sort({ createdAt: -1 }).limit(Math.min(filter.limit || 100, 300)).lean().exec();
    const list = filter.category ? rows.filter((r) => r.lines.some((l: any) => l.category === filter.category)) : rows;
    return list.map((r) => ({ ...r, lines: undefined, modelsCount: r.lines.length }));
  }

  async get(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Réception introuvable.');
    const r = await this.model(db).findById(id).lean().exec();
    if (!r) throw new NotFoundException('Réception introuvable.');
    return r;
  }
}
