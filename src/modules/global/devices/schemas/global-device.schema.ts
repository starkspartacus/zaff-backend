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

  /** Masqué des boutiques (ancien modèle, doublon…) sans être supprimé */
  @Prop({ default: true, index: true })
  active: boolean;
}

export const GlobalDeviceSchema = SchemaFactory.createForClass(GlobalDevice);
GlobalDeviceSchema.index({ brandKey: 1, modelKey: 1 }, { unique: true });
