import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PaymentMethod } from '../../../../common/enums/payment-method.enum';
import { SaleType } from '../../../../common/enums/sale-type.enum';

export type SaleDocument = Sale & Document;

@Schema({ _id: false })
export class SaleItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ default: null })
  productSku: string;

  @Prop({ default: null })
  productCategory: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  total: number;

  @Prop({ default: false })
  warrantyEnabled: boolean;

  @Prop({ default: 0 })
  warrantyMonths: number;

  @Prop({ default: null })
  serialNumber: string;
}

@Schema({ timestamps: true, collection: 'sales' })
export class Sale {
  @Prop({ type: Number, index: true })
  invoiceNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null, index: true })
  customerId: Types.ObjectId;

  @Prop({ default: () => new Date(), index: true })
  saleDate: Date;

  @Prop({ required: true, default: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ required: true, default: 0 })
  total: number;

  @Prop({ enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Prop({ enum: SaleType, default: SaleType.PURCHASE, index: true })
  saleType: SaleType;

  @Prop({ default: null })
  returnStatus: string;

  @Prop({ default: null })
  returnDate: Date;

  @Prop({ type: [SaleItem], default: [] })
  items: SaleItem[];

  @Prop({ default: null })
  notes: string;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
