import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { CATEGORY_PROFILES, DEFAULT_PROFILE, DEVICE_MODELS } from '../../../common/catalog/device-catalog';
import { ImagesService, imageKey, modelKeyOf } from '../images/images.service';
import { GlobalDevice, GlobalDeviceDocument } from './schemas/global-device.schema';
import { DeviceRequest, DeviceRequestDocument } from './schemas/device-request.schema';
import { DeviceUsageService } from './device-usage.service';

export interface DeviceInput {
  category: string;
  brand: string;
  model: string;
  variants?: string[];
  colors?: string[];
  specs?: { label: string; value: string }[];
  active?: boolean;
}

type UploadFile = { buffer: Buffer; size: number };
const ADMIN = { establishmentId: null, establishmentName: 'ZAFF', name: 'Administrateur ZAFF' };
const CACHE_MS = 5 * 60 * 1000;
const clean = (list?: string[]) => [...new Set((list || []).map((v) => v.trim()).filter(Boolean))].slice(0, 40);
const cleanSpecs = (list?: { label: string; value: string }[]) =>
  (list || [])
    .map((s) => ({ label: String(s?.label || '').trim().slice(0, 40), value: String(s?.value || '').trim().slice(0, 160) }))
    .filter((s) => s.label && s.value)
    .slice(0, 30);

/**
 * Catalogue global des appareils, tenu par l'administrateur de la plateforme.
 * Les boutiques le consultent (`catalog()`) pour créer leurs produits : modèle, capacités, coloris et photos.
 */
@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new Logger(DevicesService.name);
  private cache: { at: number; data: ReturnType<DevicesService['build']> } | null = null;

  constructor(
    @InjectModel(GlobalDevice.name, GLOBAL_CONNECTION) private readonly model: Model<GlobalDeviceDocument>,
    private readonly images: ImagesService,
    @Optional() @InjectModel(DeviceRequest.name, GLOBAL_CONNECTION) private readonly requests?: Model<DeviceRequestDocument>,
    @Optional() private readonly usage?: DeviceUsageService,
  ) {}

  /** Premier démarrage : le catalogue est rempli avec les appareils connus de ZAFF (sans photos) */
  async onModuleInit() {
    try {
      if ((await this.model.estimatedDocumentCount()) > 0) return;
      const seen = new Set<string>();
      const docs: Array<Record<string, unknown>> = [];
      for (const [category, brands] of Object.entries(DEVICE_MODELS)) {
        for (const [brand, models] of Object.entries(brands)) {
          for (const m of models) {
            const key = `${imageKey(brand)}|${modelKeyOf(brand, m.name)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            docs.push({ category, brand, model: m.name, brandKey: imageKey(brand), modelKey: modelKeyOf(brand, m.name), variants: m.variants || [], colors: m.colors || [], photos: [], active: true });
          }
        }
      }
      await this.model.insertMany(docs);
      this.logger.log(`Catalogue global des appareils initialisé (${docs.length} appareils)`);
    } catch (e: any) {
      this.logger.warn(`Initialisation du catalogue global ignorée : ${e.message}`);
    }
  }

  private invalidate() {
    this.cache = null;
  }

  private view(d: any) {
    const photos = (d.photos || []).map((p: any) => ({ imageId: p.imageId, color: p.color || null }));
    return {
      id: String(d._id),
      category: d.category,
      brand: d.brand,
      model: d.model,
      variants: d.variants || [],
      colors: d.colors || [],
      specs: (d.specs || []).map((s: any) => ({ label: s.label, value: s.value })),
      colorCodes: (d.colorCodes || []).map((c: any) => ({ name: c.name, hex: c.hex })),
      aiFilledAt: d.aiFilledAt || null,
      prices: (d.prices || []).map((x: any) => ({ currency: x.currency, variant: x.variant || null, variantKey: x.variantKey || '', median: x.median, shops: x.shops })),
      aliases: (d.aliases || []).length,
      photos,
      imageId: d.defaultImageId || photos[0]?.imageId || null,
      active: d.active !== false,
      shops: d.shopCount || 0,
      updatedAt: d.updatedAt || d.createdAt || null,
    };
  }

  private build(devices: any[]) {
    const models: Record<string, Record<string, Array<{ id: string; name: string; variants?: string[]; colors?: string[]; specs?: { label: string; value: string }[]; colorCodes?: { name: string; hex: string }[]; prices?: { currency: string; variant: string | null; variantKey: string; median: number; shops: number }[]; photos: { imageId: string; color: string | null }[]; imageId: string | null }>>> = {};
    for (const d of devices) {
      const v = this.view(d);
      ((models[v.category] ??= {})[v.brand] ??= []).push({
        id: v.id,
        name: v.model,
        variants: v.variants.length ? v.variants : undefined,
        colors: v.colors.length ? v.colors : undefined,
        specs: v.specs.length ? v.specs : undefined,
        colorCodes: v.colorCodes.length ? v.colorCodes : undefined,
        prices: v.prices.length ? v.prices : undefined,
        photos: v.photos,
        imageId: v.imageId,
      });
    }
    return { profiles: CATEGORY_PROFILES, defaultProfile: DEFAULT_PROFILE, models };
  }

  /** Catalogue lu par les boutiques (même forme que l'ancien catalogue statique + photos) */
  async catalog() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.data;
    const devices = await this.model.find({ active: true }).sort({ brand: 1, model: 1 }).lean().exec();
    const data = this.build(devices);
    this.cache = { at: Date.now(), data };
    return data;
  }

  // ─── Administration ───

  async list(q: { search?: string; category?: string; brand?: string; photos?: 'missing' | 'with'; review?: 'ai'; sort?: 'name' | 'popular'; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (q.category) filter.category = q.category;
    if (q.brand) filter.brandKey = imageKey(q.brand);
    let docs = await this.model.find(filter).sort({ brand: 1, model: 1 }).lean().exec();
    // Recherche mot par mot dans « marque + modèle » (« Acer Nitro V 15 », « nitro 15 », « galaxy a55 »…)
    const words = imageKey(q.search).split(' ').filter(Boolean);
    if (words.length) {
      docs = docs.filter((d: any) => {
        const hay = ` ${d.brandKey} ${d.modelKey} ${imageKey(d.model)} `;
        return words.every((w) => hay.includes(` ${w}`));
      });
    }
    if (q.review === 'ai') docs = docs.filter((d: any) => !!d.aiFilledAt);
    if (q.photos === 'missing') docs = docs.filter((d: any) => !(d.photos || []).length);
    if (q.photos === 'with') docs = docs.filter((d: any) => (d.photos || []).length);
    // « Les plus utilisés d'abord » : l'admin photographie en priorité les appareils présents dans le plus de boutiques
    if (q.sort === 'popular') docs = [...docs].sort((a: any, b: any) => (b.shopCount || 0) - (a.shopCount || 0));
    const limit = Math.min(q.limit || 60, 200);
    const page = Math.max(1, q.page || 1);
    return { total: docs.length, page, limit, items: docs.slice((page - 1) * limit, page * limit).map((d) => this.view(d)) };
  }

  async stats() {
    const docs: any[] = await this.model.find({}).select('photos active brand category shopCount').lean().exec();
    const withPhotos = docs.filter((d) => (d.photos || []).length).length;
    const used = docs.filter((d) => (d.shopCount || 0) > 0);
    const reported = (await this.images.reported()).length;
    return {
      devices: docs.length,
      active: docs.filter((d) => d.active !== false).length,
      withPhotos,
      missingPhotos: docs.length - withPhotos,
      photos: docs.reduce((t, d) => t + (d.photos || []).length, 0),
      brands: new Set(docs.map((d) => d.brand)).size,
      reported,
      usedDevices: used.length,
      usedWithPhotos: used.filter((d) => (d.photos || []).length).length,
      requests: this.requests ? await this.requests.countDocuments({ status: 'open' }) : 0,
      aiToCheck: await this.model.countDocuments({ aiFilledAt: { $ne: null } }),
    };
  }

  async get(id: string) {
    return this.view(await this.doc(id));
  }

  private async doc(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Appareil introuvable.');
    const d = await this.model.findById(id).lean().exec();
    if (!d) throw new NotFoundException('Appareil introuvable.');
    return d;
  }

  private async assertFree(brand: string, model: string, exceptId?: string) {
    const existing: any = await this.model.findOne({ brandKey: imageKey(brand), modelKey: modelKeyOf(brand, model) }).lean().exec();
    if (existing && String(existing._id) !== String(exceptId)) {
      throw new ConflictException(`« ${existing.brand} ${existing.model} » existe déjà dans le catalogue.`);
    }
  }

  private validate(dto: Partial<DeviceInput>) {
    if (dto.brand !== undefined && !imageKey(dto.brand)) throw new BadRequestException('Indiquez la marque.');
    if (dto.model !== undefined && !imageKey(dto.model)) throw new BadRequestException('Indiquez le modèle.');
    if (dto.category !== undefined && !/^[a-z0-9-]{2,60}$/.test(dto.category)) throw new BadRequestException('Catégorie invalide.');
  }

  async create(dto: DeviceInput) {
    this.validate(dto);
    await this.assertFree(dto.brand, dto.model);
    const created = await this.model.create({
      category: dto.category,
      brand: dto.brand.trim(),
      model: dto.model.trim(),
      brandKey: imageKey(dto.brand),
      modelKey: modelKeyOf(dto.brand, dto.model),
      variants: clean(dto.variants),
      colors: clean(dto.colors),
      specs: cleanSpecs(dto.specs),
      photos: [],
      active: dto.active !== false,
    });
    this.invalidate();
    return this.view(created);
  }

  async update(id: string, dto: Partial<DeviceInput>) {
    this.validate(dto);
    const d = await this.doc(id);
    const brand = dto.brand?.trim() || d.brand;
    const model = dto.model?.trim() || d.model;
    if (dto.brand !== undefined || dto.model !== undefined) await this.assertFree(brand, model, id);
    const set: Record<string, unknown> = { brand, model, brandKey: imageKey(brand), modelKey: modelKeyOf(brand, model) };
    if (dto.category !== undefined) set.category = dto.category;
    if (dto.variants !== undefined) set.variants = clean(dto.variants);
    if (dto.colors !== undefined) set.colors = clean(dto.colors);
    if (dto.specs !== undefined) set.specs = cleanSpecs(dto.specs);
    if (dto.active !== undefined) set.active = dto.active;
    const updated = await this.model.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean().exec();
    this.invalidate();
    return this.view(updated);
  }

  /** Suppression : ses photos sont effacées (ou masquées si des produits les utilisent encore) */
  async remove(id: string) {
    const d = await this.doc(id);
    for (const p of d.photos || []) await this.images.adminRemove(p.imageId);
    await this.model.deleteOne({ _id: id });
    this.invalidate();
    return { deleted: true };
  }

  /** Photo conforme d'un appareil (et d'un coloris), envoyée par l'administrateur */
  async addPhoto(id: string, file: UploadFile | undefined, thumb: UploadFile | undefined, color?: string | null) {
    const d = await this.doc(id);
    const c = color?.trim() || null;
    const img = await this.images.upload(file, { brand: d.brand, model: d.model, color: c || undefined, category: d.category, deviceId: String(d._id) }, ADMIN, { library: true, thumb });
    if (!(d.photos || []).some((p: any) => p.imageId === img.id)) {
      const set: Record<string, unknown> = {};
      if (!d.defaultImageId) set.defaultImageId = img.id;
      const colors = c && !(d.colors || []).some((x: string) => imageKey(x) === imageKey(c)) ? { colors: c } : null;
      await this.model.updateOne(
        { _id: id },
        { $push: { photos: { imageId: img.id, color: c } }, ...(colors ? { $addToSet: colors } : {}), ...(Object.keys(set).length ? { $set: set } : {}) },
      );
    }
    this.invalidate();
    // Les produits des boutiques qui n'ont pas encore de photo la reçoivent (en arrière-plan)
    this.usage?.propagate(id).catch((e) => this.logger.warn(`Transmission de la photo : ${e.message}`));
    return { device: await this.get(id), image: img };
  }

  async removePhoto(id: string, imageId: string) {
    const d = await this.doc(id);
    const photos = (d.photos || []).filter((p: any) => p.imageId !== imageId);
    const defaultImageId = d.defaultImageId === imageId ? photos[0]?.imageId || null : d.defaultImageId;
    await this.model.updateOne({ _id: id }, { $set: { photos, defaultImageId } });
    const result = await this.images.adminRemove(imageId);
    this.invalidate();
    return { device: await this.get(id), ...result };
  }

  async setDefaultPhoto(id: string, imageId: string) {
    const d = await this.doc(id);
    if (!(d.photos || []).some((p: any) => p.imageId === imageId)) throw new BadRequestException("Cette photo n'appartient pas à l'appareil.");
    await this.model.updateOne({ _id: id }, { $set: { defaultImageId: imageId } });
    this.invalidate();
    return this.get(id);
  }

  /** Retrait d'une photo signalée : on la détache aussi de son appareil */
  async removeReportedPhoto(imageId: string) {
    const all: any[] = await this.model.find({}).select('photos').lean().exec();
    const owner = all.find((d) => (d.photos || []).some((p: any) => p.imageId === imageId));
    if (owner) return this.removePhoto(String(owner._id), imageId);
    const r = await this.images.adminRemove(imageId);
    this.invalidate();
    return r;
  }

  // ─── Demandes d'ajout (modèles saisis par les boutiques, absents du catalogue) ───

  private requestView(r: any) {
    return {
      id: String(r._id),
      category: r.category || null,
      brand: r.brand,
      model: r.model,
      colors: r.colors || [],
      variants: r.variants || [],
      shops: r.shopCount || 0,
      status: r.status,
      deviceId: r.deviceId || null,
      lastSeenAt: r.lastSeenAt || r.updatedAt || null,
    };
  }

  async requestsList(status: 'open' | 'added' | 'dismissed' = 'open') {
    if (!this.requests) return [];
    const docs = await this.requests.find({ status }).sort({ shopCount: -1 }).limit(300).lean().exec();
    return docs.map((r) => this.requestView(r));
  }

  private async requestDoc(id: string): Promise<any> {
    if (!this.requests || !Types.ObjectId.isValid(id)) throw new NotFoundException('Demande introuvable.');
    const r = await this.requests.findById(id).lean().exec();
    if (!r) throw new NotFoundException('Demande introuvable.');
    return r;
  }

  /** Ajout au catalogue (fiche éventuellement corrigée par l'admin) ; les produits des boutiques y sont rattachés */
  async acceptRequest(id: string, dto: DeviceInput) {
    const r = await this.requestDoc(id);
    this.validate(dto);
    const existing: any = await this.model.findOne({ brandKey: imageKey(dto.brand), modelKey: modelKeyOf(dto.brand, dto.model) }).lean().exec();
    const device = existing ? this.view(existing) : await this.create(dto);
    await this.requests!.updateOne({ _id: r._id }, { $set: { status: 'added', deviceId: device.id } });
    const { linked } = (await this.usage?.linkRequest(id, device.id)) ?? { linked: 0 };
    this.invalidate();
    return { device: await this.get(device.id), linked };
  }

  /**
   * Doublon : la demande désigne un appareil déjà au catalogue écrit autrement. Son écriture devient un alias
   * (les prochaines saisies identiques seront reconnues) et les produits concernés y sont rattachés.
   */
  async mergeRequest(id: string, deviceId: string) {
    const r = await this.requestDoc(id);
    const d = await this.doc(deviceId);
    const alias = `${r.brandKey}|${r.modelKey}`;
    if (alias !== `${d.brandKey}|${d.modelKey}`) await this.model.updateOne({ _id: d._id }, { $addToSet: { aliases: alias } });
    await this.requests!.updateOne({ _id: r._id }, { $set: { status: 'added', deviceId: String(d._id) } });
    const { linked } = (await this.usage?.linkRequest(id, String(d._id))) ?? { linked: 0 };
    this.invalidate();
    return { device: await this.get(String(d._id)), linked };
  }

  /**
   * Données de marché proposées par l'IA : elles ne remplissent que ce qui est vide (jamais d'écrasement de la saisie
   * de l'admin), sauf les codes couleur, ajoutés aux coloris qui n'en ont pas. Renvoie les champs complétés.
   */
  async applyAiFacts(id: string, facts: { colors?: { name: string; hex?: string | null }[]; variants?: string[]; specs?: { label: string; value: string }[] }) {
    const d = await this.doc(id);
    const set: Record<string, unknown> = {};
    const changed: string[] = [];
    const few = (list: string[]) => `${list.slice(0, 4).join(', ')}${list.length > 4 ? `… (${list.length})` : ''}`;
    const hexOk = (h?: string | null) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null);
    const aiColors = (facts.colors || []).map((c) => ({ name: String(c?.name || '').trim().slice(0, 40), hex: hexOk(c?.hex) })).filter((c) => c.name).slice(0, 20);
    let colors: string[] = d.colors || [];
    if (!colors.length && aiColors.length) {
      colors = clean(aiColors.map((c) => c.name));
      set.colors = colors;
      changed.push(`coloris (${few(colors)})`);
    }
    const codes: Array<{ name: string; hex: string }> = [...(d.colorCodes || [])];
    for (const name of colors) {
      if (codes.some((c) => imageKey(c.name) === imageKey(name))) continue;
      const hex = aiColors.find((c) => imageKey(c.name) === imageKey(name))?.hex;
      if (hex) codes.push({ name, hex });
    }
    if (codes.length !== (d.colorCodes || []).length) {
      set.colorCodes = codes;
      changed.push('codes couleur');
    }
    if (!(d.variants || []).length && facts.variants?.length) {
      const variants = clean(facts.variants.map((v) => String(v).slice(0, 60)));
      set.variants = variants;
      changed.push(`capacités (${few(variants)})`);
    }
    if (!(d.specs || []).length && facts.specs?.length) {
      const specs = cleanSpecs(facts.specs);
      if (specs.length) {
        set.specs = specs;
        changed.push(`fiche technique (${specs.length} ligne${specs.length > 1 ? 's' : ''})`);
      }
    }
    // « À vérifier » seulement si l'IA a vraiment ajouté quelque chose
    if (!changed.length) return changed;
    set.aiFilledAt = new Date();
    await this.model.updateOne({ _id: d._id }, { $set: set });
    this.invalidate();
    return changed;
  }

  /** L'admin a relu la fiche complétée par l'IA : elle sort de la liste « À vérifier » */
  async markAiChecked(id: string) {
    const d = await this.doc(id);
    await this.model.updateOne({ _id: d._id }, { $set: { aiFilledAt: null } });
    this.invalidate();
    return this.get(id);
  }

  /** Fiche technique de plusieurs appareils (contrat de vente) */
  async specsFor(ids: string[]) {
    const valid = [...new Set(ids.filter((id) => id && Types.ObjectId.isValid(id)))];
    const out = new Map<string, { label: string; value: string }[]>();
    if (!valid.length) return out;
    const docs: any[] = await this.model.find({ _id: { $in: valid } }).select('specs').lean().exec();
    for (const d of docs) if ((d.specs || []).length) out.set(String(d._id), d.specs.map((s: any) => ({ label: s.label, value: s.value })));
    return out;
  }

  async dismissRequest(id: string) {
    const r = await this.requestDoc(id);
    await this.requests!.updateOne({ _id: r._id }, { $set: { status: 'dismissed' } });
    return { dismissed: true };
  }

  async reopenRequest(id: string) {
    const r = await this.requestDoc(id);
    await this.requests!.updateOne({ _id: r._id }, { $set: { status: 'open' } });
    return { reopened: true };
  }

  async sync() {
    if (!this.usage) return null;
    const result = await this.usage.sync();
    this.invalidate();
    return result;
  }
}
