import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditNoteDocument = CreditNote & Document;

/** Base de la boutique : avoir (bon d'achat) émis lors d'un retour, utilisable sur une prochaine vente */
@Schema({ timestamps: true, collection: 'credit_notes' })
export class CreditNote {
  /** Code lisible remis au client : AV-1001 */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  /** Numéro séquentiel (tri numérique : AV-999 < AV-1000) */
  @Prop({ type: Number, required: true, index: true })
  number: number;

  @Prop({ required: true })
  amount: number;

  /** Reste utilisable */
  @Prop({ required: true })
  balance: number;

  /** active | used | expired */
  @Prop({ default: 'active', index: true })
  status: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null })
  customerId: Types.ObjectId;

  @Prop({ default: null })
  customerName: string;

  @Prop({ type: Types.ObjectId, ref: 'ProductReturn', default: null })
  returnId: Types.ObjectId;

  /** Créé pour un échange immédiat */
  @Prop({ default: false })
  forExchange: boolean;

  @Prop({ type: [Object], default: [] })
  uses: Array<{ saleId: Types.ObjectId; invoiceNumber: number; amount: number; at: Date }>;

  @Prop({ type: Types.ObjectId, required: true })
  issuedBy: Types.ObjectId;

  @Prop({ required: true })
  issuedByName: string;
}

export const CreditNoteSchema = SchemaFactory.createForClass(CreditNote);
