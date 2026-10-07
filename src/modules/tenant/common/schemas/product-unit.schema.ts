import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UnitStatus } from '../../../../common/enums/unit-status.enum';

export type ProductUnitDocument = ProductUnit & Document;

/**
 * Un appareil physique, identifié par son numéro de série / IMEI.
 * Le numéro est unique dans l'établissement (une base par établissement).
 */
@Schema({ timestamps: true, collection: 'product_units' })
export class ProductUnit {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  serialNumber: string;

  @Prop({ enum: UnitStatus, default: UnitStatus.IN_STOCK, index: true })
  status: UnitStatus;

  // Mise en stock
  @Prop({ type: Types.ObjectId, default: null })
  addedBy: Types.ObjectId;

  @Prop({ default: null })
  addedByName: string;

  // Vente
  @Prop({ type: Types.ObjectId, ref: 'Sale', default: null })
  saleId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  invoiceNumber: number;

  @Prop({ default: null })
  soldPrice: number;

  @Prop({ type: Types.ObjectId, default: null })
  soldBy: Types.ObjectId;

  @Prop({ default: null })
  soldByName: string;

  @Prop({ default: null })
  soldAt: Date;

  @Prop({ default: null })
  notes: string;
}

export const ProductUnitSchema = SchemaFactory.createForClass(ProductUnit);
