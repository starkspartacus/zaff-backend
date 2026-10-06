import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PurchaseOrderStatus } from '../../../../common/enums/purchase-order-status.enum';

export type PurchaseOrderDocument = PurchaseOrder & Document;

@Schema({ _id: false })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  total: number;
}

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ default: () => new Date() })
  orderDate: Date;

  @Prop({ enum: PurchaseOrderStatus, default: PurchaseOrderStatus.PENDING })
  status: PurchaseOrderStatus;

  @Prop({ required: true, default: 0 })
  totalAmount: number;

  @Prop({ type: [PurchaseOrderItem], default: [] })
  items: PurchaseOrderItem[];

  @Prop({ default: null })
  notes: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
