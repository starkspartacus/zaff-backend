import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EstablishmentDocument = Establishment & Document;

@Schema({ timestamps: true, collection: 'establishments' })
export class Establishment {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  databaseName: string;

  @Prop({ trim: true })
  phone: string;

  @Prop({ lowercase: true, trim: true })
  email: string;

  @Prop({ trim: true })
  address: string;

  @Prop({ default: 'F', trim: true })
  currency: string;

  @Prop({ default: 'active', enum: ['active', 'suspended'] })
  status: string;

  @Prop({ default: 'standard' })
  subscriptionPlan: string;

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>;
}

export const EstablishmentSchema = SchemaFactory.createForClass(Establishment);
