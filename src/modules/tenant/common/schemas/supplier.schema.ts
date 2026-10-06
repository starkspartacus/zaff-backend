import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierDocument = Supplier & Document;

@Schema({ timestamps: true, collection: 'suppliers' })
export class Supplier {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  contactPerson: string;

  @Prop({ trim: true, lowercase: true, default: null })
  email: string;

  @Prop({ trim: true, default: null })
  phone: string;

  @Prop({ trim: true, default: null })
  address: string;

  @Prop({ default: null })
  notes: string;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
