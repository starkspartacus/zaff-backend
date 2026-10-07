import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CashClosingDocument = CashClosing & Document;

export type ClosingStatus = 'submitted' | 'validated';

export interface PaymentTotals {
  cash: number;
  mobile: number;
  card: number;
  bank_transfer: number;
  credit: number;
}

/** Base de la boutique : clôture de caisse d'un collaborateur (fin de journée / de service) */
@Schema({ timestamps: true, collection: 'cash_closings' })
export class CashClosing {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  sellerId: Types.ObjectId;

  @Prop({ required: true })
  sellerName: string;

  /** Première vente incluse */
  @Prop({ required: true })
  openedAt: Date;

  @Prop({ required: true, index: true })
  closedAt: Date;

  @Prop({ default: 0 })
  salesCount: number;

  @Prop({ default: 0 })
  itemsCount: number;

  /** Montants encaissés par mode de paiement, calculés par le serveur */
  @Prop({ type: Object, required: true })
  totals: PaymentTotals;

  @Prop({ default: 0 })
  totalAmount: number;

  /** Remboursements de retours donnés par le collaborateur (déjà déduits de totals) */
  @Prop({ type: Object, default: { cash: 0, mobile: 0, count: 0 } })
  refunds: { cash: number; mobile: number; count: number };

  /** Espèces attendues (= totals.cash) et comptées par le vendeur */
  @Prop({ default: 0 })
  expectedCash: number;

  @Prop({ default: 0 })
  declaredCash: number;

  /** Écart = compté − attendu (négatif : il manque de l'argent) */
  @Prop({ default: 0 })
  cashDifference: number;

  @Prop({ default: null })
  notes: string;

  @Prop({ default: 'submitted', index: true })
  status: ClosingStatus;

  @Prop({ type: Types.ObjectId, default: null })
  validatedBy: Types.ObjectId;

  @Prop({ default: null })
  validatedByName: string;

  @Prop({ default: null })
  validatedAt: Date;

  @Prop({ default: null })
  ownerNotes: string;
}

export const CashClosingSchema = SchemaFactory.createForClass(CashClosing);
CashClosingSchema.index({ closedAt: -1 });
