import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { nextSequence } from '../common/sequence';
import { Actor } from '../sales/sales.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeBatch, CodeBatchSchema, CodeSeries, CodeSeriesSchema } from './code-label.schema';
import { MAX_SEQ, formatCode, parseCode, suggestPrefix } from './code-format';

@Injectable()
export class CodeLabelsService {
  constructor(
    private readonly tenants: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private series(db: string) { return this.tenants.getModel<CodeSeries>(db, CodeSeries.name, CodeSeriesSchema); }
  private batches(db: string) { return this.tenants.getModel<CodeBatch>(db, CodeBatch.name, CodeBatchSchema); }
  private counters(db: string) { return this.tenants.getModel<Counter>(db, Counter.name, CounterSchema); }
  private products(db: string) { return this.tenants.getModel<Product>(db, Product.name, ProductSchema); }
  private units(db: string) { return this.tenants.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }

  /** Séries existantes + catégories de la boutique sans série (avec un préfixe proposé) */
  async listSeries(db: string) {
    const [series, cats] = await Promise.all([
      this.series(db).find().sort({ category: 1 }).lean().exec(),
      this.products(db).find().select('category').lean().exec(),
    ]);
    const used = await Promise.all(
      series.map((s: any) => this.units(db).countDocuments({ serialNumber: { $regex: `^${s.prefix}-\\d{8}$` } })),
    );
    const known = new Set(series.map((s: any) => s.category.toLowerCase()));
    const taken = new Set(series.map((s: any) => s.prefix));
    const suggestions = [...new Set(cats.map((p: any) => p.category).filter(Boolean))]
      .filter((c) => !known.has(String(c).toLowerCase()))
      .map((category) => {
        let prefix = suggestPrefix(String(category));
        for (let i = 2; taken.has(prefix); i++) prefix = `${prefix.slice(0, 3)}${i}`.slice(0, 5);
        taken.add(prefix);
        return { category, prefix };
      });
    return {
      series: series.map((s: any, i) => ({ ...s, usedCount: used[i], locked: (s.generatedCount || 0) > 0 })),
      suggestions,
    };
  }

  async createSeries(db: string, category: string, rawPrefix: string, actor: Actor) {
    const prefix = rawPrefix.trim().toUpperCase();
    const cat = category.trim();
    if (await this.series(db).findOne({ prefix }).lean().exec()) throw new ConflictException(`Le préfixe ${prefix} est déjà utilisé par une autre catégorie.`);
    if (await this.series(db).findOne({ category: cat }).lean().exec()) throw new ConflictException(`La catégorie « ${cat} » a déjà sa série de codes.`);
    try {
      return await this.series(db).create({ category: cat, prefix, generatedCount: 0, createdByName: actor.name });
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException(`Le préfixe ${prefix} est déjà utilisé.`);
      throw e;
    }
  }

  /** Le préfixe ne change plus dès qu'un code a été généré (les étiquettes déjà collées resteraient orphelines) */
  async updateSeries(db: string, id: string, category: string, rawPrefix: string) {
    const s: any = await this.getSeries(db, id);
    const prefix = rawPrefix.trim().toUpperCase();
    if (prefix !== s.prefix) {
      if (s.generatedCount > 0) throw new BadRequestException(`Des codes ${s.prefix}- ont déjà été générés : le préfixe ne peut plus changer.`);
      if (await this.series(db).findOne({ prefix, _id: { $ne: s._id } }).lean().exec()) throw new ConflictException(`Le préfixe ${prefix} est déjà utilisé.`);
    }
    const res = await this.series(db).findOneAndUpdate(
      { _id: s._id, ...(prefix !== s.prefix ? { generatedCount: 0 } : {}) },
      { $set: { category: category.trim(), prefix } },
      { new: true },
    );
    if (!res) throw new BadRequestException('Des codes viennent d\'être générés : le préfixe ne peut plus changer.');
    return res;
  }

  async deleteSeries(db: string, id: string) {
    const s: any = await this.getSeries(db, id);
    if (s.generatedCount > 0) throw new BadRequestException('Cette série a déjà des codes générés : elle est conservée pour la traçabilité.');
    await this.series(db).deleteOne({ _id: s._id, generatedCount: 0 });
    return { deleted: true };
  }

  private async getSeries(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Série introuvable.');
    const s = await this.series(db).findById(id).lean().exec();
    if (!s) throw new NotFoundException('Série introuvable.');
    return s;
  }

  /** Réserve atomiquement une plage de numéros pour un préfixe : deux générations simultanées ne se chevauchent jamais */
  private async reserve(db: string, prefix: string, count: number): Promise<number> {
    const name = `label:${prefix}`;
    const counters = this.counters(db);
    for (let attempt = 0; attempt < 3; attempt++) {
      const after: any = await counters.findOneAndUpdate({ _id: name, seq: { $lte: MAX_SEQ - count } }, { $inc: { seq: count } }, { new: true }).lean().exec();
      if (after) return after.seq - count + 1;
      if (await counters.findOne({ _id: name }).lean().exec()) throw new BadRequestException(`La série ${prefix} est épuisée : créez un nouveau préfixe.`);
      try {
        await counters.create({ _id: name, seq: 0 });
      } catch (e: any) {
        if (e?.code !== 11000) throw e; // créé au même moment par un autre poste
      }
    }
    throw new ConflictException('Génération impossible pour le moment : réessayez.');
  }

  async generate(db: string, seriesId: string, count: number, productId: string | undefined, actor: Actor) {
    const s: any = await this.getSeries(db, seriesId);
    let product: any = null;
    if (productId) {
      if (!Types.ObjectId.isValid(productId)) throw new BadRequestException('Modèle inconnu.');
      product = await this.products(db).findById(productId).lean().exec();
      if (!product) throw new NotFoundException('Modèle introuvable.');
    }
    const from = await this.reserve(db, s.prefix, count);
    let codes = Array.from({ length: count }, (_, i) => formatCode(s.prefix, from + i));
    let to = from + count - 1;
    // Garantie d'unicité : un N° de série identique saisi à la main avant la création de la série est sauté
    for (let guard = 0; guard < 5; guard++) {
      const clash = await this.units(db).find({ serialNumber: { $in: codes } }).select('serialNumber').lean().exec();
      if (!clash.length) break;
      const bad = new Set(clash.map((u: any) => u.serialNumber));
      codes = codes.filter((c) => !bad.has(c));
      const more = await this.reserve(db, s.prefix, bad.size);
      codes.push(...Array.from({ length: bad.size }, (_, i) => formatCode(s.prefix, more + i)));
      to = more + bad.size - 1;
    }
    const number = await nextSequence(this.counters(db), 'code_batch', async () => 0);
    const batch = await this.batches(db).create({
      number,
      code: `LOT-${number}`,
      seriesId: s._id,
      category: s.category,
      prefix: s.prefix,
      fromSeq: from,
      toSeq: to,
      codes,
      count: codes.length,
      productId: product?._id || null,
      productName: product ? [product.name, product.model].filter(Boolean).join(' ') : null,
      createdBy: new Types.ObjectId(actor.userId),
      createdByName: actor.name,
      createdByRole: actor.role || null,
      prints: [],
    });
    await this.series(db).updateOne({ _id: s._id }, { $inc: { generatedCount: codes.length } });
    if (actor.role !== 'admin') {
      await this.notifications.notify(db, {
        type: 'codes.generated',
        title: 'Codes appareils générés',
        message: `${actor.name} a généré ${codes.length} code(s) ${s.prefix}- (${s.category})${product ? ` pour ${batch.productName}` : ''} — lot ${batch.code}`,
        level: 'info',
        roles: ['admin'],
        actorId: actor.userId,
        data: { batchId: String(batch._id) },
      });
    }
    this.notifications.invalidate(db, ['code-labels']);
    return this.getBatch(db, String(batch._id));
  }

  async listBatches(db: string) {
    const list: any[] = await this.batches(db).find().sort({ createdAt: -1 }).limit(100).lean().exec();
    const all = list.flatMap((b) => b.codes);
    const used = new Set(
      (await this.units(db).find({ serialNumber: { $in: all } }).select('serialNumber').lean().exec()).map((u: any) => u.serialNumber),
    );
    return list.map((b) => ({ ...b, codes: undefined, usedCount: b.codes.filter((c: string) => used.has(c)).length, printCount: (b.prints || []).length }));
  }

  /** Lot avec l'état de chaque code : libre, ou collé sur tel appareil (statut) */
  async getBatch(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lot introuvable.');
    const b: any = await this.batches(db).findById(id).lean().exec();
    if (!b) throw new NotFoundException('Lot introuvable.');
    const units = await this.units(db).find({ serialNumber: { $in: b.codes } }).populate('productId').lean().exec();
    const byCode = new Map(units.map((u: any) => [u.serialNumber, u]));
    return {
      ...b,
      printCount: (b.prints || []).length,
      usedCount: units.length,
      items: b.codes.map((code: string) => {
        const u: any = byCode.get(code);
        return u
          ? { code, used: true, status: u.status, productName: u.productId ? [u.productId.name, u.productId.model].filter(Boolean).join(' ') : null }
          : { code, used: false, status: null, productName: null };
      }),
    };
  }

  async markPrinted(db: string, id: string, format: string, count: number | undefined, actor: Actor) {
    const b: any = await this.batches(db).findById(id).lean().exec();
    if (!b) throw new NotFoundException('Lot introuvable.');
    await this.batches(db).updateOne({ _id: b._id }, { $push: { prints: { at: new Date(), byName: actor.name, format, count: count || b.count } } });
    return { ok: true };
  }

  rejectReason(db: string, code: string) {
    return codeRejectReason(this.tenants, db, code);
  }
}

/**
 * Contrôle d'un code au format ZAFF avant la mise en stock : chiffre de contrôle juste et numéro réellement généré.
 * Renvoie la raison du refus, ou null (code accepté, ou autre format : N° de série du fabricant).
 */
export async function codeRejectReason(tenants: TenantConnectionService, db: string, code: string): Promise<string | null> {
  const parsed = parseCode(code);
  if (!parsed) return null;
  const s = await tenants.getModel<CodeSeries>(db, CodeSeries.name, CodeSeriesSchema).findOne({ prefix: parsed.prefix }).lean().exec();
  if (!s) return null;
  if (!parsed.valid) return 'Code ZAFF mal saisi (chiffre de contrôle faux) : scannez l\'étiquette ou vérifiez les chiffres.';
  const issued = await tenants.getModel<CodeBatch>(db, CodeBatch.name, CodeBatchSchema).findOne({ prefix: parsed.prefix, codes: code }).select('_id').lean().exec();
  if (!issued) return `Ce code ${parsed.prefix}- n'a jamais été généré par la boutique.`;
  return null;
}
