import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationsService } from '../../tenant/notifications/notifications.service';
import { Product, ProductSchema } from '../../tenant/common/schemas/product.schema';
import { Establishment, EstablishmentDocument } from '../establishments/schemas/establishment.schema';
import { ImagesService, imageKey, modelKeyOf } from '../images/images.service';
import { GlobalDevice, GlobalDeviceDocument } from './schemas/global-device.schema';
import { DeviceRequest, DeviceRequestDocument } from './schemas/device-request.schema';

/** Ce qu'il faut d'un produit de boutique pour le relier au catalogue global */
export interface TrackedProduct {
  _id: unknown;
  category?: string | null;
  brand?: string | null;
  /** Désignation du produit = modèle (« Samsung Galaxy A55 5G ») ; `model` = capacité / variante (« 256 Go ») */
  name?: string | null;
  model?: string | null;
  color?: string | null;
  deviceId?: string | null;
  imageId?: string | null;
}

const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
/** Un prix conseillé n'est publié qu'à partir de ce nombre de boutiques (aucun prix individuel déductible) */
export const MIN_SHOPS_FOR_PRICE = 3;
export const variantKeyOf = (v?: string | null) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const median = (list: number[]) => {
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Lien entre les produits des boutiques et le catalogue global :
 * - compte les boutiques qui utilisent chaque appareil (l'admin photographie d'abord les plus utilisés) ;
 * - crée une demande d'ajout quand une boutique saisit un modèle inconnu du catalogue ;
 * - transmet automatiquement la photo officielle aux produits qui n'en ont pas encore.
 * Ne bloque jamais l'enregistrement d'un produit : toute erreur est seulement journalisée.
 */
@Injectable()
export class DeviceUsageService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeviceUsageService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(GlobalDevice.name, GLOBAL_CONNECTION) private readonly devices: Model<GlobalDeviceDocument>,
    @InjectModel(DeviceRequest.name, GLOBAL_CONNECTION) private readonly requests: Model<DeviceRequestDocument>,
    @InjectModel(Establishment.name, GLOBAL_CONNECTION) private readonly establishments: Model<EstablishmentDocument>,
    private readonly tenants: TenantConnectionService,
    private readonly images: ImagesService,
    @Optional() private readonly realtime?: RealtimeService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    // Filet de sécurité : recalcul complet régulier (produits supprimés, anciens produits, photos manquées)
    this.timer = setInterval(() => this.sync().catch((e) => this.logger.warn(`Synchronisation du catalogue : ${e.message}`)), SYNC_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private products(db: string) {
    return this.tenants.getModel<Product>(db, Product.name, ProductSchema) as unknown as Model<any>;
  }

  private async findDevice(p: TrackedProduct): Promise<any | null> {
    if (p.deviceId && Types.ObjectId.isValid(p.deviceId)) {
      const d = await this.devices.findById(p.deviceId).lean().exec();
      if (d) return d;
    }
    if (!p.brand?.trim() || !p.name?.trim()) return null;
    const brandKey = imageKey(p.brand);
    const modelKey = modelKeyOf(p.brand, p.name);
    return (
      (await this.devices.findOne({ brandKey, modelKey }).lean().exec()) ??
      // Écriture différente fusionnée par l'admin (« Galaxy A55 » saisi « A55 5G Samsung »…)
      (await this.devices.findOne({ aliases: `${brandKey}|${modelKey}` }).lean().exec())
    );
  }

  /** Photo de l'appareil pour ce coloris (sinon la photo par défaut) */
  static pickPhoto(device: any, color?: string | null): string | null {
    const photos: { imageId: string; color: string | null }[] = device?.photos || [];
    if (!photos.length || device.active === false) return null;
    const byColor = color ? photos.find((p) => p.color && imageKey(p.color) === imageKey(color)) : null;
    return byColor?.imageId || device.defaultImageId || photos[0].imageId;
  }

  private async addShop(deviceId: unknown, db: string) {
    const d: any = await this.devices.findOneAndUpdate({ _id: deviceId }, { $addToSet: { shops: db } }, { new: true }).lean().exec();
    if (d) await this.devices.updateOne({ _id: deviceId }, { $set: { shopCount: (d.shops || []).length } });
  }

  /** Donne la photo au produit s'il n'en a toujours pas (la photo compte un produit de plus) */
  private async givePhoto(db: string, productId: unknown, imageId: string) {
    await this.images.attach(imageId);
    const updated = await this.products(db).findOneAndUpdate({ _id: productId, imageId: null }, { $set: { imageId } }, { new: true }).exec();
    if (!updated) await this.images.release(imageId);
    return !!updated;
  }

  /** Après création / modification d'un produit de boutique */
  async track(db: string, product: TrackedProduct | null | undefined) {
    if (!product) return;
    try {
      const device = await this.findDevice(product);
      if (device) {
        if (String(product.deviceId || '') !== String(device._id)) {
          await this.products(db).updateOne({ _id: product._id }, { $set: { deviceId: String(device._id) } });
        }
        await this.addShop(device._id, db);
        const photo = !product.imageId && DeviceUsageService.pickPhoto(device, product.color);
        if (photo && (await this.givePhoto(db, product._id, photo))) this.realtime?.invalidate(db, ['products']);
        return;
      }
      if (product.brand?.trim() && product.name?.trim()) await this.request(db, product);
    } catch (e: any) {
      this.logger.warn(`Suivi du catalogue (${db}) : ${e.message}`);
    }
  }

  /** Modèle inconnu du catalogue : demande d'ajout (une par modèle, toutes boutiques confondues) */
  private async request(db: string, p: TrackedProduct) {
    const brandKey = imageKey(p.brand!);
    const modelKey = modelKeyOf(p.brand!, p.name!);
    const existing: any = await this.requests.findOne({ brandKey, modelKey }).lean().exec();
    const color = p.color?.trim();
    const variant = p.model?.trim();
    if (!existing) {
      try {
        await this.requests.create({
          category: p.category || null,
          brand: p.brand!.trim(),
          model: withoutBrand(p.brand!, p.name!),
          brandKey,
          modelKey,
          colors: color ? [color] : [],
          variants: variant ? [variant] : [],
          shops: [db],
          shopCount: 1,
          status: 'open',
          lastSeenAt: new Date(),
        });
        return;
      } catch (e: any) {
        if (e?.code !== 11000) throw e; // créée au même moment par une autre boutique : on la complète
      }
    }
    const update: Record<string, unknown> = { $addToSet: { shops: db }, $set: { lastSeenAt: new Date() } };
    const after: any = await this.requests.findOneAndUpdate({ brandKey, modelKey }, update, { new: true }).lean().exec();
    const set: Record<string, unknown> = { shopCount: (after?.shops || []).length };
    if (color && !(after?.colors || []).some((c: string) => imageKey(c) === imageKey(color))) set.colors = [...(after?.colors || []), color].slice(0, 20);
    if (variant && !(after?.variants || []).some((c: string) => imageKey(c) === imageKey(variant))) set.variants = [...(after?.variants || []), variant].slice(0, 20);
    // L'appareil ajouté a été supprimé depuis : la demande redevient ouverte
    if (after?.status === 'added') set.status = 'open';
    await this.requests.updateOne({ brandKey, modelKey }, { $set: set });
  }

  /** L'admin a ajouté une photo : les produits sans photo de cet appareil la reçoivent */
  async propagate(deviceId: string) {
    const device: any = await this.devices.findById(deviceId).lean().exec();
    if (!device || !DeviceUsageService.pickPhoto(device)) return 0;
    let given = 0;
    for (const db of device.shops || []) {
      let n = 0;
      const list: any[] = await this.products(db).find({ deviceId: String(device._id), imageId: null }).lean().exec();
      for (const p of list) if (await this.givePhoto(db, p._id, DeviceUsageService.pickPhoto(device, p.color)!)) n++;
      if (n) {
        this.realtime?.invalidate(db, ['products']);
        // La boutique est prévenue : ses produits ont maintenant leur photo officielle
        void this.notifications?.notify(db, {
          type: 'catalog.photo',
          title: 'Photo officielle disponible',
          message: `${device.brand} ${device.model} : photo ajoutée par ZAFF à ${n} produit${n > 1 ? 's' : ''} de votre catalogue.`,
          level: 'success',
          roles: ['admin', 'storekeeper'],
          data: { deviceId: String(device._id), count: n },
        });
      }
      given += n;
    }
    if (given) this.logger.log(`${device.brand} ${device.model} : photo transmise à ${given} produit(s)`);
    return given;
  }

  /** Demande acceptée : les produits des boutiques concernées sont rattachés au nouvel appareil (et reçoivent sa photo) */
  async linkRequest(requestId: string, deviceId: string) {
    const req: any = await this.requests.findById(requestId).lean().exec();
    const device: any = await this.devices.findById(deviceId).lean().exec();
    if (!req || !device) return { linked: 0 };
    let linked = 0;
    for (const db of req.shops || []) {
      const list: any[] = await this.products(db).find({ brand: { $regex: `^${escape(req.brand)}$`, $options: 'i' } }).lean().exec();
      for (const p of list) {
        if (p.deviceId || modelKeyOf(p.brand || '', p.name || '') !== req.modelKey) continue;
        await this.products(db).updateOne({ _id: p._id }, { $set: { deviceId: String(device._id) } });
        linked++;
      }
      await this.addShop(device._id, db);
      if (linked) this.realtime?.invalidate(db, ['products']);
    }
    await this.propagate(String(device._id));
    return { linked };
  }

  /**
   * Recalcul complet, boutique par boutique : nombre de boutiques par appareil, demandes d'ajout,
   * rattachement des anciens produits et photos manquantes. Lancé toutes les 6 h et à la demande de l'admin.
   */
  async sync() {
    const shops: any[] = await this.establishments.find({ status: { $ne: 'suspended' } }).select('databaseName currencyCode').lean().exec();
    // Prix de vente par appareil · devise · capacité : un prix par boutique (sa médiane), puis la médiane des boutiques
    const prices = new Map<string, { device: string; currency: string; variant: string | null; byShop: Map<string, number[]> }>();
    const usage = new Map<string, Set<string>>();
    const asked = new Map<string, { db: Set<string>; p: TrackedProduct }>();
    let products = 0;
    const known = new Map<string, any>();
    const resolve = async (p: TrackedProduct) => {
      const key = `${p.deviceId || ''}|${imageKey(p.brand || '')}|${modelKeyOf(p.brand || '', p.name || '')}`;
      if (!known.has(key)) known.set(key, await this.findDevice(p));
      return known.get(key);
    };
    for (const { databaseName: db, currencyCode } of shops) {
      if (!db) continue;
      const list: any[] = await this.products(db).find({}).select('category brand name model color deviceId imageId salePrice').lean().exec();
      for (const p of list) {
        if (!p.brand?.trim() || !(p.name?.trim() || p.deviceId)) continue;
        products++;
        const device = await resolve(p);
        if (device) {
          const id = String(device._id);
          (usage.get(id) ?? usage.set(id, new Set()).get(id)!).add(db);
          if (String(p.deviceId || '') !== id) await this.products(db).updateOne({ _id: p._id }, { $set: { deviceId: id } });
          const photo = !p.imageId && DeviceUsageService.pickPhoto(device, p.color);
          if (photo) await this.givePhoto(db, p._id, photo);
          if (currencyCode && p.salePrice > 0) {
            for (const variant of [p.model?.trim() || null, null]) {
              const key = `${id}|${currencyCode}|${variantKeyOf(variant)}`;
              const entry = prices.get(key) ?? prices.set(key, { device: id, currency: currencyCode, variant, byShop: new Map() }).get(key)!;
              (entry.byShop.get(db) ?? entry.byShop.set(db, []).get(db)!).push(p.salePrice);
              if (!variant) break;
            }
          }
        } else {
          const key = `${imageKey(p.brand)}|${modelKeyOf(p.brand, p.name)}`;
          const entry = asked.get(key) ?? asked.set(key, { db: new Set(), p }).get(key)!;
          entry.db.add(db);
        }
      }
    }
    await this.devices.updateMany({ shopCount: { $gt: 0 } }, { $set: { shops: [], shopCount: 0 } });
    for (const [id, dbs] of usage) await this.devices.updateOne({ _id: id }, { $set: { shops: [...dbs], shopCount: dbs.size } });
    const published = new Map<string, any[]>();
    for (const e of prices.values()) {
      if (e.byShop.size < MIN_SHOPS_FOR_PRICE) continue;
      const list = published.get(e.device) ?? published.set(e.device, []).get(e.device)!;
      list.push({ currency: e.currency, variant: e.variant, variantKey: variantKeyOf(e.variant), median: median([...e.byShop.values()].map(median)), shops: e.byShop.size });
    }
    await this.devices.updateMany({ 'prices.0': { $exists: true } }, { $set: { prices: [] } });
    for (const [id, list] of published) await this.devices.updateOne({ _id: id }, { $set: { prices: list } });
    // Demandes ouvertes : recalculées ; celles qui ne concernent plus aucune boutique disparaissent
    await this.requests.updateMany({ status: 'open' }, { $set: { shops: [], shopCount: 0 } });
    for (const { db, p } of asked.values()) for (const d of db) await this.request(d, p);
    await this.requests.deleteMany({ status: 'open', shopCount: 0 });
    return { shops: shops.length, products, devicesUsed: usage.size, priced: published.size, requests: await this.requests.countDocuments({ status: 'open' }) };
  }
}

/** « Samsung Galaxy A55 » → « Galaxy A55 » (la marque est affichée à part) */
const withoutBrand = (brand: string, name: string) => {
  const b = brand.trim();
  const n = name.trim();
  return n.toLowerCase().startsWith(`${b.toLowerCase()} `) ? n.slice(b.length).trim() : n;
};
const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
