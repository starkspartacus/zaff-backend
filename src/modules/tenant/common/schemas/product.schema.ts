import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  sku: string;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ default: null, trim: true })
  brand: string;

  @Prop({ type: Types.ObjectId, ref: 'Brand', default: null })
  brandId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  purchasePrice: number;

  @Prop({ required: true, default: 0 })
  salePrice: number;

  @Prop({ default: 0 })
  resellerPrice: number;

  @Prop({ default: 0 })
  stockQuantity: number;

  @Prop({ default: 5 })
  minStockAlert: number;

  @Prop({ default: null })
  description: string;

  @Prop({ type: Object, default: {} })
  specifications: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  types: Array<{
    name: string;
    skuSuffix?: string;
    specifications?: Record<string, string>;
  }>;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
