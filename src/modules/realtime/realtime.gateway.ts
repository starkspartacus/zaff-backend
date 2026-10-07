import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { normalizeRole } from '../../common/enums/role.enum';
import { RealtimeService } from './realtime.service';
import { PresenceEntry, SocketUser, roleRoom, tenantRoom, userRoom } from './realtime.types';

/**
 * WebSocket temps réel, cloisonné par établissement.
 * Chaque connexion est authentifiée par le JWT de l'utilisateur et ne rejoint que
 * les salons de SON établissement : t:<db>, t:<db>:r:<rôle>, u:<userId>.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  /** Présence en mémoire : établissement → utilisateur → sockets ouvertes */
  private readonly presence = new Map<string, Map<string, PresenceEntry & { sockets: Set<string> }>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.attach(server);
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) || '';
      const payload: any = await this.jwtService.verifyAsync(token);
      const user: SocketUser = {
        userId: String(payload.sub),
        name: payload.name,
        role: normalizeRole(payload.role),
        tenantId: String(payload.tenantId),
        tenantDb: payload.tenantDb,
      };
      if (!user.tenantDb) throw new Error('missing tenant');
      client.data.user = user;
      await client.join([tenantRoom(user.tenantDb), roleRoom(user.tenantDb, user.role), userRoom(user.userId)]);
      this.trackPresence(user, client.id, true);
    } catch {
      client.emit('auth:error', { message: 'Session expirée, reconnectez-vous.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user as SocketUser | undefined;
    if (user) this.trackPresence(user, client.id, false);
  }

  /** Liste des collaborateurs connectés (propriétaire) */
  @SubscribeMessage('presence:get')
  getPresence(client: Socket) {
    const user = client.data?.user as SocketUser | undefined;
    return user ? this.presenceList(user.tenantDb) : [];
  }

  private presenceList(db: string): PresenceEntry[] {
    return [...(this.presence.get(db)?.values() || [])].map(({ sockets: _s, ...entry }) => entry);
  }

  private trackPresence(user: SocketUser, socketId: string, online: boolean) {
    const tenant = this.presence.get(user.tenantDb) || new Map();
    this.presence.set(user.tenantDb, tenant);
    const entry = tenant.get(user.userId);
    const before = tenant.size;

    if (online) {
      if (entry) entry.sockets.add(socketId);
      else tenant.set(user.userId, { userId: user.userId, name: user.name, role: user.role, since: new Date().toISOString(), sockets: new Set([socketId]) });
    } else if (entry) {
      entry.sockets.delete(socketId);
      if (entry.sockets.size === 0) tenant.delete(user.userId);
    }

    // Diffusion uniquement si la liste des personnes en ligne a changé
    if (tenant.size !== before) {
      this.server.to([roleRoom(user.tenantDb, 'admin'), roleRoom(user.tenantDb, 'superadmin')]).emit('presence', this.presenceList(user.tenantDb));
    }
    if (tenant.size === 0) this.presence.delete(user.tenantDb);
  }
}
