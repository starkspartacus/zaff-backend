import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GlobalDeviceDocument = GlobalDevice & Document;

@Schema({ _id: false })
export class DevicePhoto {
  /** Photo de la base partagée (`catalog_images`) */
  @Prop({ required: true })
  imageId: string;

  /** Coloris photographié (null : photo valable pour tous les coloris) */
  @Prop({ default: null })
  color: string;
}

/** Ligne de la fiche technique (« Écran » : « 6,6" AMOLED 120 Hz ») */
@Schema({ _id: false })
export class DeviceSpec {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true })
  value: string;
}

/** Prix de vente pratiqué (médiane sur plusieurs boutiques, par devise et capacité) — jamais le prix d'une boutique */
@Schema({ _id: false })
export class DevicePrice {
  @Prop({ required: true })
  currency: string;

  /** Capacité / variante (« 256 Go ») ; null : toutes confondues */
  @Prop({ default: null })
  variant: string;

  @Prop({ default: null })
  variantKey: string;

  @Prop({ required: true })
  median: number;

  @Prop({ required: true })
  shops: number;
}

/**
 * Catalogue global des appareils (base globale), géré par l'administrateur de la plateforme :
 * chaque appareil a ses capacités, coloris et photos conformes ; toutes les boutiques s'en servent
 * pour créer leurs produits (et récupèrent la photo sans rien envoyer).
 */
@Schema({ timestamps: true, collection: 'global_devices' })
export class GlobalDevice {
  /** Catégorie de référence (slug de `reference_categories`) */
  @Prop({ required: true, index: true })
  category: string;

  @Prop({ required: true, trim: true })
  brand: string;

  @Prop({ required: true, trim: true })
  model: string;

  @Prop({ required: true, index: true })
  brandKey: string;

  @Prop({ required: true })
  modelKey: string;

  @Prop({ type: [String], default: [] })
  variants: string[];

  @Prop({ type: [String], default: [] })
  colors: string[];

  @Prop({ type: [DevicePhoto], default: [] })
  photos: DevicePhoto[];

  /** Photo affichée par défaut (sinon la première) */
  @Prop({ default: null })
  defaultImageId: string;

  /** Code couleur (hex) de chaque coloris officiel : pastilles et illustrations */
  @Prop({ type: [Object], default: [] })
  colorCodes: Array<{ name: string; hex: string }>;

  /** Dernière complétion de la fiche par l'IA (coloris, capacités, fiche technique) */
  @Prop({ default: null })
  aiFilledAt: Date;

  /** Fiche technique officielle (affichée dans la Vitrine et la fiche produit des boutiques) */
  @Prop({ type: [DeviceSpec], default: [] })
  specs: DeviceSpec[];

  /** Bases des boutiques qui ont ce modèle en catalogue (jamais renvoyé : sert à compter et à leur transmettre les photos) */
  @Prop({ type: [String], default: [] })
  shops: string[];

  /** Nombre de boutiques (tri « les plus utilisés d'abord ») */
  @Prop({ default: 0, index: true })
  shopCount: number;

  /** Autres écritures du modèle saisies par des boutiques (« marque|modèle » normalisés), fusionnées par l'admin */
  @Prop({ type: [String], default: [], index: true })
  aliases: string[];

  /** Prix pratiqués, recalculés par la synchronisation (au moins 3 boutiques) */
  @Prop({ type: [DevicePrice], default: [] })
  prices: DevicePrice[];

  /** Masqué des boutiques (ancien modèle, doublon…) sans être supprimé */
  @Prop({ default: true, index: true })
  active: boolean;
}

export const GlobalDeviceSchema = SchemaFactory.createForClass(GlobalDevice);
GlobalDeviceSchema.index({ brandKey: 1, modelKey: 1 }, { unique: true });
