import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CatalogImageDocument = CatalogImage & Document;

/**
 * Base globale d'images produits, partagée par toutes les boutiques : une photo ajoutée par une boutique
 * pour « Samsung Galaxy A55 5G » est proposée à toutes les autres pour le même modèle.
 * Images redimensionnées par le navigateur (≤ 1000 px, JPEG / WebP) et stockées ici (≤ 600 Ko).
 */
@Schema({ timestamps: true, collection: 'catalog_images' })
export class CatalogImage {
  @Prop({ default: null, index: true })
  category: string;

  @Prop({ required: true, trim: true })
  brand: string;

  @Prop({ required: true, trim: true })
  model: string;

  @Prop({ default: null, trim: true })
  color: string;

  /** Clés de recherche normalisées (sans accents, minuscules) */
  @Prop({ required: true, index: true })
  brandKey: string;

  @Prop({ required: true, index: true })
  modelKey: string;

  @Prop({ default: null })
  colorKey: string;

  @Prop({ required: true })
  mime: string;

  @Prop({ type: Buffer, required: true, select: false })
  data: Buffer;

  @Prop({ required: true })
  bytes: number;

  /** Empreinte : la même photo n'est stockée qu'une fois */
  @Prop({ required: true, unique: true })
  sha256: string;

  @Prop({ type: Types.ObjectId, default: null })
  establishmentId: Types.ObjectId;

  @Prop({ default: null })
  establishmentName: string;

  @Prop({ default: null })
  uploadedBy: string;

  /** Nombre de produits qui utilisent cette photo (classement des suggestions) */
  @Prop({ default: 0 })
  usage: number;
}

export const CatalogImageSchema = SchemaFactory.createForClass(CatalogImage);
CatalogImageSchema.index({ brandKey: 1, modelKey: 1 });
