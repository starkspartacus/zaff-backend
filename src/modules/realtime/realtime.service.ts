import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { DataScope, roleRoom, tenantRoom, userRoom } from './realtime.types';

/** Point d'émission unique vers les navigateurs connectés (aucune dépendance aux sockets dans les services métier) */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  /** Événement vers des rôles d'un établissement (ou tout l'établissement si aucun rôle) */
  emitToTenant(db: string, event: string, payload: unknown, roles?: string[]) {
    if (!this.server) return;
    const rooms = roles?.length ? roles.map((r) => roleRoom(db, r)) : [tenantRoom(db)];
    this.server.to(rooms).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  /** Signale aux écrans ouverts quelles données ont changé : ils ne rechargent que celles-là */
  invalidate(db: string, scopes: DataScope[]) {
    if (!scopes.length) return;
    this.emitToTenant(db, 'data:invalidate', { scopes, at: new Date().toISOString() });
  }
}
