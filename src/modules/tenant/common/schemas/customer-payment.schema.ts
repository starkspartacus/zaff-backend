import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * Argent reçu d'un client à crédit (revendeur) : acompte à la vente ou paiement plus tard.
 * Compté dans la caisse du collaborateur qui l'a encaissé (clôture de caisse).
 */
@Schema({ timestamps: true, collection: 'customer_payments' })
export class CustomerPayment {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ default: null })
  customerName: string;

  @Prop({ required: true })
  amount: number;

  /** cash | mobile | card | bank_transfer */
  @Prop({ default: 'cash' })
  method: string;

  /** deposit = acompte versé à la vente, payment = remboursement de la dette */
  @Prop({ default: 'payment' })
  kind: string;

  /** Ventes soldées (en tout ou partie) par ce paiement */
  @Prop({ type: [{ saleId: Types.ObjectId, invoiceNumber: Number, amount: Number }], default: [] })
  allocations: Array<{ saleId: Types.ObjectId; invoiceNumber: number; amount: number }>;

  @Prop({ default: null })
  notes: string;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  collectedBy: Types.ObjectId;

  @Prop({ default: null })
  collectedByName: string;

  /** Clôture de caisse qui inclut ce paiement (null = pas encore clôturée) */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  closingId: Types.ObjectId;
}

export const CustomerPaymentSchema = SchemaFactory.createForClass(CustomerPayment);
