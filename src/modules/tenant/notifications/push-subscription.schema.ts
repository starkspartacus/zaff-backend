import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscriptionRecord & Document;

/** Base de la boutique : appareils (navigateurs) abonnés aux notifications push d'un collaborateur */
@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionRecord {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  role: string;

  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ type: Object, required: true })
  keys: { p256dh: string; auth: string };

  @Prop({ default: null })
  userAgent: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscriptionRecord);
