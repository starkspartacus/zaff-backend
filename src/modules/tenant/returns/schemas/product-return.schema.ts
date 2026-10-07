import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductReturnDocument = ProductReturn & Document;

/** Base de la boutique : retour d'un appareil vendu (bon état ou défectueux) et la solution appliquée */
@Schema({ timestamps: true, collection: 'product_returns' })
export class ProductReturn {
  @Prop({ type: Number, required: true, unique: true })
  returnNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'ProductUnit', required: true, index: true })
  unitId: Types.ObjectId;

  @Prop({ required: true, index: true })
  serialNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ type: Types.ObjectId, ref: 'Sale', required: true, index: true })
  saleId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  invoiceNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null })
  customerId: Types.ObjectId;

  /** change_of_mind | defective */
  @Prop({ required: true })
  reason: string;

  /** credit_note | refund | exchange | warranty_repair | paid_repair */
  @Prop({ required: true, index: true })
  action: string;

  /** early | warranty | out_of_warranty (retours défectueux) */
  @Prop({ default: null })
  defectiveStage: string;

  @Prop({ type: [String], default: [] })
  conditionsChecked: string[];

  @Prop({ default: null })
  issueDescription: string;

  @Prop({ default: 0 })
  daysSincePurchase: number;

  /** Prix payé par le client pour cet appareil */
  @Prop({ default: 0 })
  price: number;

  @Prop({ default: 0 })
  fee: number;

  /** Montant rendu (avoir ou remboursement) */
  @Prop({ default: 0 })
  amount: number;

  @Prop({ default: null })
  refundMethod: string;

  @Prop({ type: Types.ObjectId, ref: 'CreditNote', default: null })
  creditNoteId: Types.ObjectId;

  @Prop({ default: null })
  creditNoteCode: string;

  @Prop({ type: Types.ObjectId, ref: 'Repair', default: null })
  repairId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  repairTicketNumber: number;

  /** Statut de l'appareil après le retour : in_stock (revendable) | defective | in_repair */
  @Prop({ required: true })
  unitStatusAfter: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  processedBy: Types.ObjectId;

  @Prop({ required: true })
  processedByName: string;

  /** Remboursement déduit de la caisse du collaborateur à sa prochaine clôture */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  closingId: Types.ObjectId;

  @Prop({ default: null })
  notes: string;
}

export const ProductReturnSchema = SchemaFactory.createForClass(ProductReturn);
ProductReturnSchema.index({ createdAt: -1 });
