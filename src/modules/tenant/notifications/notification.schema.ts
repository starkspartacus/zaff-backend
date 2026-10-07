import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/** Base de la boutique : historique des notifications (cloche) */
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  /** sale.created, units.added, stock.low, unit.defective… */
  @Prop({ required: true, index: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'info' })
  level: NotificationLevel;

  /** Rôles destinataires */
  @Prop({ type: [String], default: ['admin'], index: true })
  roles: string[];

  /** Destinataires nominatifs (en plus des rôles) */
  @Prop({ type: [Types.ObjectId], default: [], index: true })
  userIds: Types.ObjectId[];

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  @Prop({ type: Types.ObjectId, default: null })
  actorId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  readBy: Types.ObjectId[];
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ createdAt: -1 });
// Historique conservé 60 jours
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });
