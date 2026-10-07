import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/** Vrai serveur Socket.IO : authentification JWT et cloisonnement par établissement */
describe('RealtimeGateway', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let http: HttpServer;
  let io: Server;
  let realtime: RealtimeService;
  let url: string;
  const clients: ClientSocket[] = [];

  const token = (tenantDb: string, role: string, name: string) =>
    jwt.sign({ sub: `${tenantDb}-${name}`, name, role, tenantId: tenantDb, tenantDb });

  const client = (auth: Record<string, string>) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const c = connect(url, { auth, transports: ['websocket'], forceNew: true });
      clients.push(c);
      c.on('connect', () => setTimeout(() => resolve(c), 30)); // laisse le serveur rejoindre les salons
      c.on('connect_error', reject);
    });

  const nextEvent = <T = any>(c: ClientSocket, event: string, ms = 300) =>
    new Promise<T | null>((resolve) => {
      const t = setTimeout(() => resolve(null), ms);
      c.once(event, (p: T) => {
        clearTimeout(t);
        resolve(p);
      });
    });

  beforeEach(async () => {
    http = createServer();
    io = new Server(http);
    realtime = new RealtimeService();
    const gateway = new RealtimeGateway(jwt, realtime);
    const nsp = io.of('/realtime');
    gateway.server = nsp as any;
    gateway.afterInit(nsp as any);
    nsp.on('connection', (socket) => {
      gateway.handleConnection(socket);
      socket.on('disconnect', () => gateway.handleDisconnect(socket));
      socket.on('presence:get', (_: unknown, ack: (r: unknown) => void) => ack(gateway.getPresence(socket)));
    });
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/realtime`;
  });

  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    await new Promise((r) => io.close(() => r(null)));
  });

  it('refuse une connexion sans jeton valide', async () => {
    const c = connect(url, { auth: { token: 'faux' }, transports: ['websocket'], forceNew: true });
    clients.push(c);
    const err = await nextEvent(c, 'auth:error', 1000);
    expect(err).toEqual({ message: 'Session expirée, reconnectez-vous.' });
  });

  it("ne diffuse les événements qu'aux rôles visés de la même boutique", async () => {
    const ownerA = await client({ token: token('shop_a', 'admin', 'Patron A') });
    const sellerA = await client({ token: token('shop_a', 'seller', 'Awa') });
    const ownerB = await client({ token: token('shop_b', 'admin', 'Patron B') });

    const got = [nextEvent(ownerA, 'notification'), nextEvent(sellerA, 'notification'), nextEvent(ownerB, 'notification')];
    realtime.emitToTenant('shop_a', 'notification', { type: 'sale.created' }, ['admin']);
    const [a, s, b] = await Promise.all(got);

    expect(a).toEqual({ type: 'sale.created' });
    expect(s).toBeNull(); // le vendeur n'est pas destinataire
    expect(b).toBeNull(); // une autre boutique ne reçoit jamais rien
  });

  it("prévient toute la boutique des données modifiées, et elle seule", async () => {
    const sellerA = await client({ token: token('shop_a', 'seller', 'Awa') });
    const sellerB = await client({ token: token('shop_b', 'seller', 'Ali') });
    const got = [nextEvent(sellerA, 'data:invalidate'), nextEvent(sellerB, 'data:invalidate')];
    realtime.invalidate('shop_a', ['products']);
    const [a, b] = await Promise.all(got);
    expect(a).toMatchObject({ scopes: ['products'] });
    expect(b).toBeNull();
  });

  it("indique au propriétaire qui est en ligne dans sa boutique", async () => {
    const owner = await client({ token: token('shop_a', 'admin', 'Patron') });
    const presence = nextEvent<any[]>(owner, 'presence');
    await client({ token: token('shop_a', 'storekeeper', 'Koné') });
    await client({ token: token('shop_b', 'seller', 'Ali') });

    expect((await presence)?.map((p) => p.name).sort()).toEqual(['Koné', 'Patron']);
    const list: any[] = await owner.emitWithAck('presence:get', {});
    expect(list.map((p) => p.name).sort()).toEqual(['Koné', 'Patron']);
  });
});
