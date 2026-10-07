/**
 * Démarre l'application Nest complète (sans MongoDB : connexion simulée) pour vérifier
 * l'injection de dépendances, les routes HTTP et le WebSocket /realtime.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { io } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { GLOBAL_CONNECTION } from '../src/database/database.constants';

const fakeModel: any = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' ? undefined : () => fakeQuery),
  apply: () => fakeQuery,
});
const fakeQuery: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (ok: any) => ok(0) : () => fakeQuery) });
const fakeConnection: any = {
  model: () => fakeModel,
  models: {},
  useDb: () => fakeConnection,
  close: async () => undefined,
  readyState: 1,
};

(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken(GLOBAL_CONNECTION))
    .useValue(fakeConnection)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const routes = (app.getHttpAdapter().getInstance() as any)._router.stack
    .filter((l: any) => l.route)
    .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
  console.log('ROUTES', routes.length, routes.filter((r: string) => /geo|establishments|auth/.test(r)).join(' | '));

  const unauth = await fetch(`http://127.0.0.1:${port}/api/global/establishments`);
  console.log('GET /global/establishments sans jeton ->', unauth.status);

  const token = app.get(JwtService).sign({ sub: '64e000000000000000000001', name: 'Patron', role: 'admin', tenantId: 'x', tenantDb: 'zaff_tenant_demo' });
  const socket = io(`http://127.0.0.1:${port}/realtime`, { auth: { token }, transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout')), 3000);
  });
  await new Promise((r) => setTimeout(r, 50));
  const presence = await socket.emitWithAck('presence:get', {});
  console.log('WEBSOCKET connecté, présence =', JSON.stringify(presence.map((p: any) => p.name)));
  socket.disconnect();
  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error('BOOT FAILED', e);
  process.exit(1);
});
