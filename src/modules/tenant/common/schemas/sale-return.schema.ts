import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SaleReturnDocument = SaleReturn & Document;

@Schema({ timestamps: true, collection: 'sale_returns' })
export class SaleReturn {
  @Prop({ type: Types.ObjectId, ref: 'Sale', required: true, index: true })
  saleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, default: 1 })
  quantity: number;

  @Prop({ default: () => new Date() })
  returnDate: Date;

  @Prop({ default: null })
  reason: string;
}

export const SaleReturnSchema = SchemaFactory.createForClass(SaleReturn);
