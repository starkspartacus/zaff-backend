import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Inventaire par scan : une session à la fois, scannée par toute l'équipe en même temps */
@Schema({ timestamps: true, collection: 'stock_counts' })
export class StockCount {
  @Prop({ required: true }) number: number;
  @Prop({ required: true }) code: string;
  /** Catégorie inventoriée (null = tout le stock) */
  @Prop({ default: null }) category: string;
  @Prop({ default: 'open', index: true }) status: 'open' | 'closed' | 'cancelled';
  @Prop({ type: Types.ObjectId, default: null }) startedBy: Types.ObjectId;
  @Prop({ default: null }) startedByName: string;
  @Prop({ default: () => new Date() }) startedAt: Date;
  /** N° de série scannés ($addToSet : jamais deux fois) */
  @Prop({ type: [String], default: [] }) serials: string[];
  /** Comptage des produits sans N° de série : ajouts / corrections (somme = quantité comptée) */
  @Prop({ type: [Object], default: [] }) entries: Array<{ productId: string; qty: number; byName: string; at: Date }>;
  /** Stock attendu des produits sans N° de série au démarrage (pour corriger sans fausser les ventes faites pendant le comptage) */
  @Prop({ type: [Object], default: [] }) snapshot: Array<{ productId: string; productName: string; expected: number }>;
  @Prop({ type: [String], default: [] }) scannedBy: string[];
  /** Codes scannés inconnus de la boutique */
  @Prop({ type: [String], default: [] }) unknownCodes: string[];
  @Prop({ default: null }) closedAt: Date;
  @Prop({ default: null }) closedByName: string;
  @Prop({ type: Object, default: null }) report: any;
}

export const StockCountSchema = SchemaFactory.createForClass(StockCount);
