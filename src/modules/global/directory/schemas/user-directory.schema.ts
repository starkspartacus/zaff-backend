import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDirectoryDocument = UserDirectory & Document;

/**
 * Base globale : annuaire des comptes de tous les établissements.
 * Un compte vit dans la base de sa boutique ; l'annuaire sert uniquement à
 * retrouver la boutique d'un identifiant (téléphone / e-mail) à la connexion.
 */
@Schema({ timestamps: true, collection: 'user_directory' })
export class UserDirectory {
  @Prop({ required: true, index: true })
  identifier: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  establishmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantUserId: Types.ObjectId;

  @Prop({ default: null })
  name: string;

  @Prop({ default: null })
  role: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserDirectorySchema = SchemaFactory.createForClass(UserDirectory);
UserDirectorySchema.index({ identifier: 1, establishmentId: 1 }, { unique: true });
