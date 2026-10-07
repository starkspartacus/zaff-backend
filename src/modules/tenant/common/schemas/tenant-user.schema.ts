import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../../../common/enums/role.enum';

export type TenantUserDocument = TenantUser & Document;

@Schema({ timestamps: true, collection: 'users' })
export class TenantUser {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ lowercase: true, trim: true, default: null })
  email: string;

  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, enum: [...Object.values(Role), 'standard'], default: Role.SELLER })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;
}

export const TenantUserSchema = SchemaFactory.createForClass(TenantUser);
