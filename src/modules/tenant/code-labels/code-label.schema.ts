import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Série de codes d'une catégorie (préfixe unique dans la boutique, verrouillé dès le 1er code généré) */
@Schema({ timestamps: true, collection: 'code_series' })
export class CodeSeries {
  @Prop({ required: true, trim: true }) category: string;
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) prefix: string;
  @Prop({ default: 0 }) generatedCount: number;
  @Prop({ default: null }) createdByName: string;
}
export const CodeSeriesSchema = SchemaFactory.createForClass(CodeSeries);

/** Lot de codes générés : trace de chaque génération (qui, quand, quels codes, impressions) */
@Schema({ timestamps: true, collection: 'code_batches' })
export class CodeBatch {
  @Prop({ required: true }) number: number;
  @Prop({ required: true }) code: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) seriesId: Types.ObjectId;
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) prefix: string;
  @Prop({ required: true }) fromSeq: number;
  @Prop({ required: true }) toSeq: number;
  @Prop({ type: [String], default: [], index: true }) codes: string[];
  @Prop({ required: true }) count: number;
  /** Modèle prévu (imprimé sur l'étiquette), facultatif */
  @Prop({ type: Types.ObjectId, default: null }) productId: Types.ObjectId;
  @Prop({ default: null }) productName: string;
  @Prop({ type: Types.ObjectId, default: null }) createdBy: Types.ObjectId;
  @Prop({ default: null }) createdByName: string;
  @Prop({ default: null }) createdByRole: string;
  @Prop({ type: [Object], default: [] }) prints: Array<{ at: Date; byName: string; format: string; count: number }>;
}
export const CodeBatchSchema = SchemaFactory.createForClass(CodeBatch);
