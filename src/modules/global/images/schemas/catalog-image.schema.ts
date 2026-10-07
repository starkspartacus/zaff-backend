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

  /** Fichier gardé dans MongoDB (seulement sans UploadThing) */
  @Prop({ type: Buffer, default: null, select: false })
  data: Buffer;

  /** Stockage du fichier : UploadThing (production) ou MongoDB (développement) */
  @Prop({ enum: ['uploadthing', 'database'], default: 'database' })
  storage: 'uploadthing' | 'database';

  /** Clé du fichier chez UploadThing (pour le supprimer) */
  @Prop({ default: null })
  storageKey: string;

  /** Adresse publique directe (UploadThing) */
  @Prop({ default: null })
  url: string;

  /**
   * Photothèque : importée exprès (import en masse) et gardée même si aucun produit ne l'utilise.
   * Les autres photos sont supprimées (fichier + fiche) dès que plus aucun produit ne les utilise.
   */
  @Prop({ default: false, index: true })
  library: boolean;

  /** Vignette légère (≈ 320 px) pour les cartes et listes : même stockage que la photo */
  @Prop({ type: Buffer, default: null, select: false })
  thumbData: Buffer;

  @Prop({ default: null })
  thumbKey: string;

  @Prop({ default: null })
  thumbUrl: string;

  @Prop({ default: 0 })
  thumbBytes: number;

  /** Appareil du catalogue global auquel la photo appartient (photos de l'administrateur) */
  @Prop({ default: null, index: true })
  deviceId: string;

  /** Boutiques qui ont signalé la photo (inadaptée, mauvais modèle…) */
  @Prop({ type: [Types.ObjectId], default: [] })
  reports: Types.ObjectId[];

  /** Masquée de la base partagée après 3 signalements de boutiques différentes */
  @Prop({ default: false, index: true })
  hidden: boolean;

  /** Envoyée mais pas encore rattachée à un produit enregistré (supprimée au bout d'une heure sinon) */
  @Prop({ default: true, index: true })
  pending: boolean;

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
CatalogImageSchema.index({ pending: 1, createdAt: 1 });
