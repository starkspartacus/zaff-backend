import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as webpush from 'web-push';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { PushSubscriptionRecord, PushSubscriptionSchema } from './push-subscription.schema';
import { PushSubscribeDto } from './dto/push-subscription.dto';

export interface PushPayload {
  title: string;
  body: string;
  /** Page ouverte au clic */
  url: string;
  /** Regroupe les notifications du même type sur le téléphone */
  tag: string;
  level?: string;
}

/** Notifications push (téléphone / ordinateur), même quand l'application est fermée */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey: string | null;

  constructor(
    config: ConfigService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    const push = config.get<{ publicKey: string | null; privateKey: string | null; subject: string }>('push');
    this.publicKey = push?.publicKey && push.privateKey ? push.publicKey : null;
    if (this.publicKey && push?.privateKey) {
      webpush.setVapidDetails(push.subject, this.publicKey, push.privateKey);
    } else {
      this.logger.log('Notifications push désactivées (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non définies).');
    }
  }

  get enabled() {
    return !!this.publicKey;
  }

  private getModel(db: string) {
    return this.tenantConnectionService.getModel<PushSubscriptionRecord>(db, PushSubscriptionRecord.name, PushSubscriptionSchema);
  }

  async subscribe(db: string, user: { userId: string; role: string }, dto: PushSubscribeDto) {
    await this.getModel(db).updateOne(
      { endpoint: dto.endpoint },
      { $set: { userId: new Types.ObjectId(user.userId), role: user.role, keys: dto.keys, userAgent: dto.userAgent || null } },
      { upsert: true },
    );
    return { subscribed: true };
  }

  async unsubscribe(db: string, user: { userId: string }, endpoint: string) {
    await this.getModel(db).deleteOne({ endpoint, userId: new Types.ObjectId(user.userId) });
    return { subscribed: false };
  }

  /** Envoie à tous les appareils des rôles / personnes visés ; supprime les abonnements expirés */
  async send(db: string, audience: { roles: string[]; userIds: string[] }, payload: PushPayload) {
    if (!this.enabled) return;
    const or: Record<string, unknown>[] = [];
    if (audience.roles.length) or.push({ role: { $in: audience.roles } });
    if (audience.userIds.length) or.push({ userId: { $in: audience.userIds.map((id) => new Types.ObjectId(id)) } });
    if (!or.length) return;

    const subs = await this.getModel(db).find({ $or: or }).lean().exec();
    const body = JSON.stringify(payload);
    const expired: string[] = [];
    await Promise.allSettled(
      subs.map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 6 * 3600, urgency: 'high' })
          .catch((err: { statusCode?: number; message?: string }) => {
            if (err.statusCode === 404 || err.statusCode === 410) expired.push(s.endpoint);
            else this.logger.warn(`Push failed (${err.statusCode}): ${err.message}`);
          }),
      ),
    );
    if (expired.length) await this.getModel(db).deleteMany({ endpoint: { $in: expired } });
  }
}
