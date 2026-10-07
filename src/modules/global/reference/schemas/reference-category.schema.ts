import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReferenceCategoryDocument = ReferenceCategory & Document;

/** Base globale : catégories et marques de référence, communes à toutes les boutiques */
@Schema({ timestamps: true, collection: 'reference_categories' })
export class ReferenceCategory {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ default: null })
  icon: string;

  @Prop({ type: [String], default: [] })
  brands: string[];

  /** Les appareils de cette catégorie ont un N° de série / IMEI */
  @Prop({ default: true })
  serialTracked: boolean;

  @Prop({ default: 0 })
  order: number;
}

export const ReferenceCategorySchema = SchemaFactory.createForClass(ReferenceCategory);
