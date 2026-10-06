import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RepairStatus } from '../../../../common/enums/repair-status.enum';

export type RepairDocument = Repair & Document;

@Schema({ timestamps: true, collection: 'repairs' })
export class Repair {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  deviceName: string;

  @Prop({ trim: true, default: null })
  serialNumber: string;

  @Prop({ required: true })
  issueDescription: string;

  @Prop({ enum: RepairStatus, default: RepairStatus.RECEIVED, index: true })
  status: RepairStatus;

  @Prop({ default: null })
  estimatedCost: number;

  @Prop({ default: null })
  actualCost: number;

  @Prop({ default: 0 })
  laborCost: number;

  @Prop({ default: 0 })
  partsCost: number;

  @Prop({ default: null })
  diagnosis: string;

  @Prop({ default: null })
  repairNotes: string;

  @Prop({ default: () => new Date() })
  receivedDate: Date;

  @Prop({ default: null })
  estimatedCompletion: Date;

  @Prop({ default: null })
  completedDate: Date;
}

export const RepairSchema = SchemaFactory.createForClass(Repair);
