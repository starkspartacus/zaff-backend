import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { StockMovementType, StockReferenceType } from '../../../../common/enums/stock-movement.enum';

export type StockMovementDocument = StockMovement & Document;

@Schema({ timestamps: true, collection: 'stock_movements' })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, enum: StockMovementType })
  movementType: StockMovementType;

  @Prop({ required: true })
  quantity: number;

  @Prop({ enum: StockReferenceType, default: StockReferenceType.MANUAL })
  referenceType: StockReferenceType;

  @Prop({ default: null })
  referenceId: string;

  @Prop({ default: null })
  notes: string;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
