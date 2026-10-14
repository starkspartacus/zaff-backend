import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PurchaseOrderStatus } from '../../../../common/enums/purchase-order-status.enum';

export type PurchaseOrderDocument = PurchaseOrder & Document;

@Schema({ _id: false })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ default: '' })
  productName: string;

  @Prop({ default: false })
  hasSerialNumbers: boolean;

  @Prop({ required: true })
  quantity: number;

  /** Quantité déjà reçue (peut dépasser la commande si le fournisseur en livre plus) */
  @Prop({ default: 0 })
  receivedQty: number;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  total: number;
}

@Schema({ _id: false })
export class PurchaseReception {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ default: null }) byName: string;
  @Prop({ type: [Object], default: [] }) lines: Array<{ productId: string; productName: string; quantity: number; serialNumbers?: string[] }>;
}

@Schema({ _id: false })
export class SupplierPayment {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'cash' }) method: string;
  @Prop({ default: null }) byName: string;
  @Prop({ default: null }) note: string;
}

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  /** N° de bon de commande (séquence atomique) → code BC-<n> */
  @Prop({ default: null, index: true })
  number: number;

  @Prop({ default: null })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ default: '' })
  supplierName: string;

  @Prop({ default: () => new Date() })
  orderDate: Date;

  /** Livraison attendue le */
  @Prop({ default: null })
  expectedAt: Date;

  @Prop({ enum: PurchaseOrderStatus, default: PurchaseOrderStatus.PENDING, index: true })
  status: PurchaseOrderStatus;

  /** Montant dû au fournisseur (commandé ; ramené au reçu si la commande est soldée) */
  @Prop({ required: true, default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  paidAmount: number;

  /** Reste à payer au fournisseur */
  @Prop({ default: 0 })
  amountDue: number;

  @Prop({ type: [PurchaseOrderItem], default: [] })
  items: PurchaseOrderItem[];

  @Prop({ type: [PurchaseReception], default: [] })
  receptions: PurchaseReception[];

  @Prop({ type: [SupplierPayment], default: [] })
  payments: SupplierPayment[];

  @Prop({ default: null })
  createdByName: string;

  @Prop({ default: null })
  notes: string;

  /** Verrou optimiste : chaque réception incrémente la version */
  @Prop({ default: 0 })
  version: number;

  @Prop({ default: null })
  closedAt: Date;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
