import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WarrantyStatus } from '../../../../common/enums/warranty-status.enum';

export type WarrantyDocument = Warranty & Document;

@Schema({ timestamps: true, collection: 'warranties' })
export class Warranty {
  @Prop({ type: Types.ObjectId, ref: 'Sale', default: null })
  saleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ trim: true, default: null, index: true })
  serialNumber: string;

  @Prop({ default: () => new Date() })
  warrantyStart: Date;

  @Prop({ default: 12 })
  warrantyDurationMonths: number;

  @Prop({ required: true })
  warrantyEnd: Date;

  @Prop({ enum: WarrantyStatus, default: WarrantyStatus.ACTIVE, index: true })
  status: WarrantyStatus;

  @Prop({ default: null })
  notes: string;
}

export const WarrantySchema = SchemaFactory.createForClass(Warranty);
