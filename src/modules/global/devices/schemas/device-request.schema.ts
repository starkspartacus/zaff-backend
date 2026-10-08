import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeviceRequestDocument = DeviceRequest & Document;

/**
 * Modèle créé par des boutiques mais absent du catalogue global : demande d'ajout automatique.
 * L'administrateur l'ajoute (les produits des boutiques concernées sont alors rattachés et reçoivent les photos) ou l'ignore.
 */
@Schema({ timestamps: true, collection: 'device_requests' })
export class DeviceRequest {
  /** Catégorie de la boutique (slug) */
  @Prop({ default: null })
  category: string;

  @Prop({ required: true, trim: true })
  brand: string;

  @Prop({ required: true, trim: true })
  model: string;

  @Prop({ required: true })
  brandKey: string;

  @Prop({ required: true })
  modelKey: string;

  /** Variantes / coloris vus dans les boutiques (aide à remplir la fiche) */
  @Prop({ type: [String], default: [] })
  colors: string[];

  @Prop({ type: [String], default: [] })
  variants: string[];

  /** Bases des boutiques concernées (jamais renvoyé) */
  @Prop({ type: [String], default: [] })
  shops: string[];

  @Prop({ default: 0, index: true })
  shopCount: number;

  @Prop({ default: 'open', enum: ['open', 'added', 'dismissed'], index: true })
  status: 'open' | 'added' | 'dismissed';

  @Prop({ default: null })
  deviceId: string;

  @Prop({ default: () => new Date() })
  lastSeenAt: Date;
}

export const DeviceRequestSchema = SchemaFactory.createForClass(DeviceRequest);
DeviceRequestSchema.index({ brandKey: 1, modelKey: 1 }, { unique: true });
