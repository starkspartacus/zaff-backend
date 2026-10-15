import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * Réception de marchandise (ravitaillement) : trace de tout ce qui est entré en stock d'un coup,
 * par scan (mise en stock) ou par la réception d'une commande fournisseur.
 */
@Schema({ timestamps: true, collection: 'stock_receptions' })
export class StockReception {
  @Prop({ required: true }) number: number;
  @Prop({ required: true, index: true }) code: string;
  @Prop({ default: 'scan' }) source: 'scan' | 'purchase_order';
  @Prop({ type: Types.ObjectId, default: null }) orderId: Types.ObjectId;
  @Prop({ default: null }) orderCode: string;
  @Prop({ default: null }) supplierName: string;
  @Prop({ default: null }) note: string;
  @Prop({ type: Types.ObjectId, default: null }) receivedBy: Types.ObjectId;
  @Prop({ default: null }) receivedByName: string;
  /** Une ligne par modèle (capacité / couleur séparées) */
  @Prop({ type: [Object], default: [] })
  lines: Array<{
    productId: string;
    productName: string;
    category: string;
    categoryName: string;
    brand: string | null;
    model: string | null;
    color: string | null;
    quantity: number;
    serialNumbers: string[];
    unitCost: number;
  }>;
  @Prop({ type: [Object], default: [] }) rejected: Array<{ productName: string; serialNumber: string; reason: string }>;
  @Prop({ default: 0, index: true }) totalUnits: number;
  @Prop({ default: 0 }) totalValue: number;
  @Prop({ type: [Object], default: [] }) byCategory: Array<{ category: string; categoryName: string; quantity: number }>;
}
export const StockReceptionSchema = SchemaFactory.createForClass(StockReception);
