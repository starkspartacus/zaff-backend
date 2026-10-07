import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  firstName: string;

  @Prop({ trim: true, default: null })
  lastName: string;

  @Prop({ trim: true, index: true, default: null })
  phone: string;

  @Prop({ trim: true, lowercase: true, default: null })
  email: string;

  @Prop({ trim: true, default: null })
  address: string;

  @Prop({ trim: true, default: null })
  companyName: string;

  @Prop({ default: null })
  notes: string;

  @Prop({ default: 0 })
  totalPurchases: number;

  @Prop({ default: false, index: true })
  isReseller: boolean;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
