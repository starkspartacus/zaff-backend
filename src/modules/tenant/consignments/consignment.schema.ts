import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Un appareil confié au revendeur : chez lui (`out`), vendu par lui (`sold`) ou rendu en stock (`returned`) */
export class ConsignmentItem {
  unitId: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  serialNumber: string;
  /** Prix magasin convenu (ce que le revendeur doit payer s'il vend) */
  price: number;
  status: 'out' | 'sold' | 'returned';
  closedAt: Date | null;
  closedByName: string | null;
  saleId: Types.ObjectId | null;
  invoiceNumber: number | null;
}

/**
 * Bon de remise à un revendeur : il emporte des appareils pour les revendre à ses clients (il garde sa marge).
 * Les appareils restent à la boutique tant qu'ils ne sont ni payés ni rendus.
 */
@Schema({ timestamps: true, collection: 'consignments' })
export class Consignment {
  @Prop({ required: true, index: true })
  number: number;

  @Prop({ required: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: null })
  customerPhone: string;

  @Prop({ type: Array, default: [] })
  items: ConsignmentItem[];

  /** Date de retour prévue (3 jours par défaut) */
  @Prop({ required: true, index: true })
  dueAt: Date;

  @Prop({ default: 3 })
  days: number;

  @Prop({ default: null })
  notes: string;

  /** Collaborateur qui a remis la marchandise */
  @Prop({ type: Types.ObjectId, default: null })
  handedBy: Types.ObjectId;

  @Prop({ default: null })
  handedByName: string;

  /** open = au moins un appareil encore chez le revendeur */
  @Prop({ default: 'open', index: true })
  status: string;

  @Prop({ default: null })
  lastReminderAt: Date;

  @Prop({ default: null })
  closedAt: Date;
}

export const ConsignmentSchema = SchemaFactory.createForClass(Consignment);
