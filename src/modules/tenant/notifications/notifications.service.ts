import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { DataScope } from '../../realtime/realtime.types';
import { Notification, NotificationLevel, NotificationSchema } from './notification.schema';

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  level?: NotificationLevel;
  roles: string[];
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
        actorId: input.actorId ? new Types.ObjectId(input.actorId) : null,
      });
      const roles = [...new Set([...input.roles, 'superadmin'])];
      this.realtime.emitToTenant(db, 'notification', this.serialize(doc), roles);
    } catch (e: any) {
      this.logger.warn(`Notification '${input.type}' failed: ${e.message}`);
    }
  }

  invalidate(db: string, scopes: DataScope[]) {
    this.realtime.invalidate(db, scopes);
  }

  async list(db: string, user: { userId: string; role: string }, limit = 50) {
    const docs = await this.getModel(db)
      .find({ roles: user.role === 'superadmin' ? { $exists: true } : user.role })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .exec();
    return docs.map((d) => this.serialize(d, user.userId));
  }

  async markAllRead(db: string, user: { userId: string; role: string }) {
    const me = new Types.ObjectId(user.userId);
    const res = await this.getModel(db).updateMany({ roles: user.role, readBy: { $ne: me } }, { $addToSet: { readBy: me } });
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
