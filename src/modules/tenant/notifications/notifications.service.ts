import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { DataScope } from '../../realtime/realtime.types';
import { Notification, NotificationLevel, NotificationSchema } from './notification.schema';
import { PushService } from './push.service';

/** Page ouverte quand on touche la notification push */
const PUSH_URL: Record<string, string> = {
  'sale.created': '/app',
  'units.added': '/app/stock',
  'stock.low': '/app/stock',
  'cash.closed': '/app/cash-closings',
  'cash.validated': '/app/cash-closing',
  'return.created': '/app/returns',
  'repair.ready': '/app/repairs',
  'catalog.photo': '/app/catalog',
};

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  level?: NotificationLevel;
  roles: string[];
  /** Personnes précises à prévenir (ex. le vendeur dont la clôture est validée) */
  userIds?: string[];
  data?: Record<string, any>;
  actorId?: string | null;
}

/** Notifications métier : enregistrées dans la base de la boutique puis poussées en temps réel */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  private getModel(db: string) {
    return this.tenantConnectionService.getModel<Notification>(db, Notification.name, NotificationSchema);
  }

  /** N'interrompt jamais l'opération métier : une notification ratée est seulement journalisée */
  async notify(db: string, input: NotifyInput) {
    try {
      const doc = await this.getModel(db).create({
        ...input,
        level: input.level || 'info',
        data: input.data || {},
        userIds: (input.userIds || []).map((id) => new Types.ObjectId(id)),
        actorId: input.actorId ? new Types.ObjectId(input.actorId) : null,
      });
      const payload = this.serialize(doc);
      if (input.roles.length) {
        this.realtime.emitToTenant(db, 'notification', payload, [...new Set([...input.roles, 'superadmin'])]);
      }
      for (const userId of input.userIds || []) this.realtime.emitToUser(userId, 'notification', payload);

      // Push téléphone : en arrière-plan, l'opération métier n'attend pas
      void this.push
        .send(db, { roles: input.roles, userIds: input.userIds || [] }, {
          title: input.title,
          body: input.message,
          url: PUSH_URL[input.type] || '/app',
          tag: input.type,
          level: input.level || 'info',
        })
        .catch((e) => this.logger.warn(`Push '${input.type}' failed: ${e.message}`));
    } catch (e: any) {
      this.logger.warn(`Notification '${input.type}' failed: ${e.message}`);
    }
  }

  invalidate(db: string, scopes: DataScope[]) {
    this.realtime.invalidate(db, scopes);
  }

  /** Notifications visibles : celles de mon rôle ou qui me sont adressées */
  private audience(user: { userId: string; role: string }) {
    if (user.role === 'superadmin') return {};
    return { $or: [{ roles: user.role }, { userIds: new Types.ObjectId(user.userId) }] };
  }

  async list(db: string, user: { userId: string; role: string }, limit = 50) {
    const docs = await this.getModel(db)
      .find(this.audience(user))
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .exec();
    return docs.map((d) => this.serialize(d, user.userId));
  }

  async markAllRead(db: string, user: { userId: string; role: string }) {
    const me = new Types.ObjectId(user.userId);
    const res = await this.getModel(db).updateMany({ ...this.audience(user), readBy: { $ne: me } }, { $addToSet: { readBy: me } });
    return { updated: res.modifiedCount };
  }

  private serialize(doc: any, userId?: string) {
    return {
      id: String(doc._id),
      type: doc.type,
      title: doc.title,
      message: doc.message,
      level: doc.level,
      data: doc.data,
      createdAt: doc.createdAt,
      read: userId ? (doc.readBy || []).some((id: unknown) => String(id) === userId) : false,
    };
  }
}
