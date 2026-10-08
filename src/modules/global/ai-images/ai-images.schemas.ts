import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiImageJobDocument = AiImageJob & Document;
export type AiImageCandidateDocument = AiImageCandidate & Document;

/** Recherche de photos par l'IA pour un lot d'appareils (traitée en arrière-plan, reprise après un redémarrage) */
@Schema({ timestamps: true, collection: 'ai_image_jobs' })
export class AiImageJob {
  @Prop({ default: 'queued', enum: ['queued', 'running', 'paused', 'done', 'cancelled', 'failed'], index: true })
  status: 'queued' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed';

  /** En pause (quota gratuit des IA atteint) : reprise automatique à cette heure */
  @Prop({ default: null })
  resumeAt: Date;

  @Prop({ type: [String], default: [] })
  deviceIds: string[];

  /** Appareils déjà traités (reprise sans refaire le travail) */
  @Prop({ type: [String], default: [] })
  doneIds: string[];

  @Prop({ default: 0 })
  total: number;

  @Prop({ default: 0 })
  processed: number;

  /** Photos retenues (en attente de validation ou publiées) */
  @Prop({ default: 0 })
  found: number;

  @Prop({ default: 0 })
  published: number;

  /** Appareils pour lesquels aucune photo correcte n'a été trouvée */
  @Prop({ default: 0 })
  notFound: number;

  /** Appareils en erreur (page inaccessible, IA indisponible…) */
  @Prop({ default: 0 })
  failures: number;

  /** Publication directe des photos dont la note atteint `minScore` (sinon : validation par l'admin) */
  @Prop({ default: false })
  auto: boolean;

  @Prop({ default: 90 })
  minScore: number;

  /** Photos retenues au plus par appareil (une par coloris + la meilleure) */
  @Prop({ default: 4 })
  perDevice: number;

  @Prop({ default: null })
  label: string;

  @Prop({ default: null })
  lastError: string;

  @Prop({ default: null })
  finishedAt: Date;
}

export const AiImageJobSchema = SchemaFactory.createForClass(AiImageJob);

/** Photo trouvée par l'IA, déjà au bon format, en attente de décision (ou publiée / rejetée) */
@Schema({ timestamps: true, collection: 'ai_image_candidates' })
export class AiImageCandidate {
  @Prop({ required: true, index: true })
  jobId: string;

  @Prop({ required: true, index: true })
  deviceId: string;

  /** Coloris reconnu (parmi ceux de l'appareil), null = tous coloris */
  @Prop({ default: null })
  color: string;

  @Prop({ default: 0, index: true })
  score: number;

  /** Avis de l'IA : vue, fond, texte, raison (en français) */
  @Prop({ type: Object, default: {} })
  verdict: Record<string, unknown>;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ default: null })
  pageUrl: string;

  @Prop({ required: true })
  sha256: string;

  /** Image prête à publier (WebP carré ≤ 1000 px) et vignette : effacées après la décision */
  @Prop({ type: Buffer, default: null })
  full: Buffer | null;

  @Prop({ type: Buffer, default: null })
  thumb: Buffer | null;

  @Prop({ default: 0 })
  bytes: number;

  @Prop({ default: 'pending', enum: ['pending', 'published', 'rejected', 'failed'], index: true })
  status: 'pending' | 'published' | 'rejected' | 'failed';

  @Prop({ default: null })
  imageId: string;

  @Prop({ default: null })
  error: string;

  /** Les propositions non traitées sont supprimées au bout de 14 jours */
  @Prop({ default: () => new Date(Date.now() + 14 * 24 * 3600 * 1000) })
  expiresAt: Date;
}

export const AiImageCandidateSchema = SchemaFactory.createForClass(AiImageCandidate);
AiImageCandidateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AiImageCandidateSchema.index({ deviceId: 1, sha256: 1 });
