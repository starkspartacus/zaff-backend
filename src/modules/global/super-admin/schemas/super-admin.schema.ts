import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SuperAdminDocument = SuperAdmin & Document;

@Schema({ timestamps: true, collection: 'super_admins' })
export class SuperAdmin {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 'superadmin' })
  role: string;
}

export const SuperAdminSchema = SchemaFactory.createForClass(SuperAdmin);
