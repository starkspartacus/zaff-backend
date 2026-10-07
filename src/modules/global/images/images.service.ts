import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { CatalogImage, CatalogImageDocument } from './schemas/catalog-image.schema';
import { CUSTOM_ID_PREFIX, DatabaseStorage, MEDIA_STORAGE, MediaStorage } from './media-storage';

export const MAX_IMAGE_BYTES = 600 * 1024;
export const MAX_THUMB_BYTES = 80 * 1024;
/** Signalements de boutiques différentes avant de masquer une photo de la base partagée */
export const REPORTS_TO_HIDE = 3;
/** Une photo envoyée mais jamais rattachée à un produit est supprimée passé ce délai */
export const PENDING_TTL_MS = 60 * 60 * 1000;

export const imageKey = (v?: string | null) =>
  (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Clé du modèle sans la marque en tête : « Samsung Galaxy A55 » et « Galaxy A55 » désignent la même photo */
export const modelKeyOf = (brand?: string | null, model?: string | null) => {
  const b = imageKey(brand);
  const m = imageKey(model);
  return b && m.startsWith(`${b} `) ? m.slice(b.length + 1) : m;
};

/** Type réel d'après les premiers octets (on ne fait pas confiance au nom ni au type annoncé) */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface ImageUploader {
  establishmentId?: string | null;
  establishmentName?: string | null;
  name?: string | null;
}

/**
 * Base d'images partagée, sans fichier orphelin :
 * - une photo envoyée est « en attente » tant qu'aucun produit enregistré ne l'utilise ;
 * - enregistrer un produit la rattache (`attach`), changer ou supprimer sa photo la libère (`release`) ;
 * - une photo libérée qui n'est plus utilisée et n'appartient pas à la photothèque est effacée
 *   **chez UploadThing et dans la base** ;
 * - filet de sécurité toutes les heures : photos en attente abandonnées, fichiers UploadThing sans fiche.
 */
@Injectable()
export class ImagesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ImagesService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly storage: MediaStorage;

  constructor(
    @InjectModel(CatalogImage.name, GLOBAL_CONNECTION) private readonly model: Model<CatalogImageDocument>,
    @Optional() @Inject(MEDIA_STORAGE) storage?: MediaStorage,
  ) {
    this.storage = storage || new DatabaseStorage();
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    this.logger.log(`Photos stockées sur ${this.storage.name === 'uploadthing' ? 'UploadThing' : 'MongoDB (UPLOADTHING_TOKEN absent)'}`);
    this.timer = setInterval(() => this.cleanup().catch((e) => this.logger.warn(`Nettoyage des photos : ${e.message}`)), PENDING_TTL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private view(img: any) {
    return {
      id: String(img._id),
      category: img.category,
      brand: img.brand,
      model: img.model,
      color: img.color,
      bytes: img.bytes,
      establishmentName: img.establishmentName,
      usage: img.usage || 0,
      library: !!img.library,
      pending: !!img.pending,
      createdAt: img.createdAt,
      hidden: !!img.hidden,
      deviceId: img.deviceId || null,
      reports: (img.reports || []).length,
      hasThumb: !!(img.thumbKey || img.thumbBytes),
      url: `/global/images/${img._id}/file`,
    };
  }

  /** Photos d'un modèle (la couleur demandée d'abord), ou de la marque dans la catégorie */
  async search(q: { brand?: string; model?: string; color?: string; category?: string }) {
    const brandKey = imageKey(q.brand);
    const modelKey = modelKeyOf(q.brand, q.model);
    if (!brandKey && !modelKey) return [];
    // Les photos en attente d'une autre boutique ne sont pas proposées (elles peuvent disparaître)
    const filter: Record<string, unknown> = { pending: false, hidden: { $ne: true } };
    if (brandKey) filter.brandKey = brandKey;
    if (modelKey) filter.modelKey = modelKey;
    else if (q.category) filter.category = q.category;
    const docs = await this.model.find(filter).sort({ usage: -1, createdAt: -1 }).limit(48).lean().exec();
    const colorKey = imageKey(q.color);
    const ranked = colorKey ? [...docs].sort((a, b) => Number(b.colorKey === colorKey) - Number(a.colorKey === colorKey)) : docs;
    return ranked.slice(0, 24).map((d) => this.view(d));
  }

  /** Photothèque de ma boutique (photos que j'ai importées ou ajoutées) */
  async mine(establishmentId: string) {
    if (!establishmentId || !Types.ObjectId.isValid(establishmentId)) return [];
    const docs = await this.model
      .find({ establishmentId: new Types.ObjectId(establishmentId), pending: false })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
    return docs.map((d) => this.view(d));
  }

  /**
   * Envoi d'une photo. Appelé par le navigateur au moment d'« Enregistrer » (jamais au simple choix d'un fichier).
   * `library` : import dans la photothèque (gardée même sans produit).
   */
  async upload(
    file: { buffer: Buffer; size: number } | undefined,
    meta: { brand: string; model: string; color?: string; category?: string; deviceId?: string },
    by: ImageUploader,
    opts: { library?: boolean; thumb?: { buffer: Buffer; size: number } } = {},
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucune photo reçue.');
    const thumb = opts.thumb?.buffer?.length ? opts.thumb : null;
    if (thumb && (thumb.size > MAX_THUMB_BYTES || !sniffImage(thumb.buffer))) throw new BadRequestException('Vignette invalide (80 Ko maximum, JPEG / PNG / WebP).');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Photo trop lourde (600 Ko maximum après réduction).');
    const mime = sniffImage(file.buffer);
    if (!mime) throw new BadRequestException('Format non reconnu : envoyez une photo JPEG, PNG ou WebP.');
    if (!imageKey(meta.brand) || !imageKey(meta.model)) throw new BadRequestException('Indiquez la marque et le modèle de la photo.');

    // Même photo déjà présente : on la réutilise (et on la garde en photothèque si demandé)
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.model.findOne({ sha256 }).lean().exec();
    if (existing) {
      if (opts.library && !existing.library) await this.model.updateOne({ _id: existing._id }, { $set: { library: true, pending: false } });
      return { ...this.view({ ...existing, library: existing.library || !!opts.library }), duplicate: true };
    }

    const baseName = imageKey(`${meta.brand} ${meta.model} ${meta.color || ''}`).replace(/ /g, '-');
    const stored = await this.storage.put(file.buffer, { name: `${baseName}.${EXT[mime]}`, mime, customId: `${CUSTOM_ID_PREFIX}${sha256}` });
    let storedThumb: { key: string | null; url: string | null } = { key: null, url: null };
    const thumbMime = thumb ? sniffImage(thumb.buffer)! : null;
    try {
      if (thumb && thumbMime) {
        storedThumb = await this.storage.put(thumb.buffer, { name: `${baseName}-vignette.${EXT[thumbMime]}`, mime: thumbMime, customId: `${CUSTOM_ID_PREFIX}${sha256}-t` });
      }
      const created = await this.model.create({
        category: meta.category || null,
        deviceId: meta.deviceId || null,
        brand: meta.brand.trim(),
        model: meta.model.trim(),
        color: meta.color?.trim() || null,
        brandKey: imageKey(meta.brand),
        modelKey: modelKeyOf(meta.brand, meta.model),
        colorKey: imageKey(meta.color) || null,
        mime,
        data: this.storage.name === 'database' ? file.buffer : null,
        storage: this.storage.name,
        storageKey: stored.key,
        url: stored.url,
        bytes: file.size,
        thumbData: thumb && this.storage.name === 'database' ? thumb.buffer : null,
        thumbKey: storedThumb.key,
        thumbUrl: storedThumb.url,
        thumbBytes: thumb?.size || 0,
        sha256,
        library: !!opts.library,
        pending: !opts.library,
        establishmentId: by.establishmentId && Types.ObjectId.isValid(by.establishmentId) ? new Types.ObjectId(by.establishmentId) : null,
        establishmentName: by.establishmentName || null,
        uploadedBy: by.name || null,
      });
      return { ...this.view(created), duplicate: false };
    } catch (e) {
      // La fiche n'a pas pu être créée : on ne laisse pas le fichier seul chez UploadThing
      const keys = [stored.key, storedThumb.key].filter((k): k is string => !!k);
      if (keys.length) await this.storage.remove(keys).catch(() => undefined);
      throw e;
    }
  }

  /** Fichier (ou sa vignette s'il en a une) : `url` pour une redirection vers UploadThing, sinon `data` */
  async file(id: string, size: 'full' | 'thumb' = 'full') {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    const img: any = await this.model.findById(id).select('+data +thumbData mime sha256 url storage thumbUrl thumbBytes').lean().exec();
    if (!img) throw new NotFoundException('Image introuvable.');
    const useThumb = size === 'thumb' && !!(img.thumbUrl || img.thumbData);
    const data: Buffer | null = useThumb ? img.thumbData : img.data;
    return {
      data,
      url: (useThumb ? img.thumbUrl : img.url) as string | null,
      mime: (data && sniffImage(Buffer.from(data))) || img.mime,
      etag: `${img.sha256}${useThumb ? '-t' : ''}`,
    };
  }

  /** Un produit enregistré utilise cette photo */
  async attach(id?: string | null) {
    if (!id) return;
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Photo invalide.');
    const img = await this.model.findOneAndUpdate({ _id: id }, { $inc: { usage: 1 }, $set: { pending: false } }, { new: true }).exec();
    if (!img) throw new BadRequestException("Cette photo n'existe plus : choisissez-en une autre.");
  }

  /** Un produit n'utilise plus cette photo : effacée (fichier + fiche) si plus personne ne s'en sert */
  async release(id?: string | null) {
    if (!id || !Types.ObjectId.isValid(id)) return;
    const img: any = await this.model.findOneAndUpdate({ _id: id }, { $inc: { usage: -1 } }, { new: true }).exec();
    if (img && img.usage <= 0 && !img.library) await this.destroy(img);
  }

  private async destroy(img: { _id: unknown; storageKey?: string | null; thumbKey?: string | null }) {
    const keys = [img.storageKey, img.thumbKey].filter((k): k is string => !!k);
    if (keys.length) await this.storage.remove(keys);
    await this.model.deleteOne({ _id: img._id });
  }

  /** Annulation : l'enregistrement du produit a échoué après l'envoi de la photo */
  async discard(id: string, establishmentId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    const img: any = await this.model.findById(id).lean().exec();
    if (!img) return { deleted: false };
    if (!img.pending || (img.usage || 0) > 0 || img.library || String(img.establishmentId) !== String(establishmentId)) return { deleted: false };
    await this.destroy(img);
    return { deleted: true };
  }

  /** Photothèque : seule la boutique qui a ajouté la photo peut la retirer, et seulement si aucun produit ne l'utilise */
  async remove(id: string, establishmentId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    const img: any = await this.model.findById(id).lean().exec();
    if (!img) throw new NotFoundException('Image introuvable.');
    if (String(img.establishmentId) !== String(establishmentId)) {
      throw new ForbiddenException('Cette photo a été ajoutée par une autre boutique : vous ne pouvez pas la supprimer.');
    }
    if ((img.usage || 0) > 0) {
      throw new ConflictException(`Cette photo est utilisée par ${img.usage} produit${img.usage > 1 ? 's' : ''} : changez d'abord leur photo.`);
    }
    await this.destroy(img);
    return { deleted: true };
  }

  /**
   * Filet de sécurité (toutes les heures) :
   * 1. photos envoyées mais jamais rattachées (navigateur fermé pendant l'enregistrement) ;
   * 2. fichiers ZAFF présents chez UploadThing sans fiche dans la base.
   */
  async cleanup(now = Date.now()) {
    const cutoff = new Date(now - PENDING_TTL_MS);
    const stale = await this.model.find({ pending: true, createdAt: { $lt: cutoff } }).lean().exec();
    let pending = 0;
    for (const img of stale) {
      if ((img.usage || 0) > 0 || img.library) continue;
      await this.destroy(img);
      pending++;
    }

    let remote = 0;
    if (this.storage.list) {
      const files = await this.storage.list();
      const ours = files.filter((f) => f.customId?.startsWith(CUSTOM_ID_PREFIX) && f.uploadedAt < cutoff.getTime());
      if (ours.length) {
        const keys = ours.map((f) => f.key);
        const docs = await this.model.find({ $or: [{ storageKey: { $in: keys } }, { thumbKey: { $in: keys } }] }).lean().exec();
        const known = new Set(docs.flatMap((d) => [d.storageKey, d.thumbKey]));
        const orphans = ours.filter((f) => !known.has(f.key)).map((f) => f.key);
        if (orphans.length) await this.storage.remove(orphans);
        remote = orphans.length;
      }
    }
    if (pending || remote) this.logger.log(`Nettoyage : ${pending} photo(s) abandonnée(s), ${remote} fichier(s) orphelin(s) supprimé(s)`);
    return { pending, remote };
  }

  /**
   * Signalement par une autre boutique (photo inadaptée, mauvais modèle…). Après 3 boutiques différentes,
   * la photo n'est plus proposée dans la base partagée ; les produits qui l'utilisent la gardent.
   */
  async report(id: string, establishmentId: string) {
    if (!Types.ObjectId.isValid(id) || !establishmentId || !Types.ObjectId.isValid(establishmentId)) throw new NotFoundException('Image introuvable.');
    const img: any = await this.model.findById(id).lean().exec();
    if (!img) throw new NotFoundException('Image introuvable.');
    if (String(img.establishmentId) === String(establishmentId)) {
      throw new BadRequestException('Cette photo vient de votre boutique : supprimez-la depuis la Photothèque.');
    }
    const updated: any = await this.model
      .findOneAndUpdate({ _id: id }, { $addToSet: { reports: new Types.ObjectId(establishmentId) } }, { new: true })
      .exec();
    const count = new Set((updated?.reports || []).map(String)).size;
    if (count >= REPORTS_TO_HIDE && !updated.hidden) await this.model.updateOne({ _id: id }, { $set: { hidden: true } });
    return { reported: true, hidden: count >= REPORTS_TO_HIDE };
  }

  /** Espace utilisé : toute la base partagée, ma boutique, et le quota UploadThing s'il est connu */
  async usage(establishmentId?: string | null) {
    const docs: any[] = await this.model.find({}).select('bytes thumbBytes establishmentId library hidden').lean().exec();
    const sum = (list: any[]) => list.reduce((t, d) => t + (d.bytes || 0) + (d.thumbBytes || 0), 0);
    const mine = docs.filter((d) => establishmentId && String(d.establishmentId) === String(establishmentId));
    const provider = this.storage.usage ? await this.storage.usage().catch(() => null) : null;
    return {
      storage: this.storage.name,
      shared: { photos: docs.length, bytes: sum(docs), hidden: docs.filter((d) => d.hidden).length },
      mine: { photos: mine.length, bytes: sum(mine), library: mine.filter((d) => d.library).length },
      provider,
    };
  }

  // ─── Administrateur de la plateforme ───

  /**
   * Retrait d'une photo par l'administrateur : effacée (fichier + fiche) si aucun produit ne l'utilise,
   * sinon masquée de la base partagée (les produits qui l'utilisent la gardent).
   */
  async adminRemove(id: string) {
    if (!Types.ObjectId.isValid(id)) return { deleted: false, hidden: false };
    const img: any = await this.model.findById(id).lean().exec();
    if (!img) return { deleted: false, hidden: false };
    if ((img.usage || 0) > 0) {
      await this.model.updateOne({ _id: id }, { $set: { hidden: true, library: false, deviceId: null } });
      return { deleted: false, hidden: true };
    }
    await this.destroy(img);
    return { deleted: true, hidden: false };
  }

  /** Photos signalées par les boutiques (à traiter par l'administrateur) */
  async reported() {
    const docs = await this.model.find({ $or: [{ hidden: true }, { 'reports.0': { $exists: true } }] }).sort({ createdAt: -1 }).limit(200).lean().exec();
    return docs.map((d) => this.view(d));
  }

  /** L'administrateur garde la photo : signalements effacés, de nouveau proposée */
  async clearReports(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    await this.model.updateOne({ _id: id }, { $set: { reports: [], hidden: false } });
    return { kept: true };
  }
}
