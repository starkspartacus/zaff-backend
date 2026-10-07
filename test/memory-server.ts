/**
 * Lance le VRAI backend (contrôleurs, gardes, validation, services, WebSocket) avec une base
 * en mémoire (src/testing/fake-model.ts) : démonstrations et tests navigateur sans MongoDB.
 * Les données disparaissent à l'arrêt.  Usage : npm run dev:memory  (port 8000 par défaut)
 *
 * Comptes créés (mot de passe « secret ») :
 *   Propriétaire +2250700000001 · Vendeuse +2250700000002 · Magasinier +2250700000003
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { GLOBAL_CONNECTION } from '../src/database/database.constants';
import { TenantConnectionService } from '../src/database/tenant-connection.service';
import { FakeModel, fakeTenantConnection } from '../src/testing/fake-model';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { UnitsService } from '../src/modules/tenant/units/units.service';

process.env.MONGODB_URI ||= 'mongodb://memoire';
process.env.JWT_SECRET ||= 'memory-server-secret';

const UNIQUE = { ProductUnit: ['serialNumber'], CreditNote: ['code'], ProductReturn: ['returnNumber'], PushSubscriptionRecord: ['endpoint'] };
const tenants = new Map<string, ReturnType<typeof fakeTenantConnection>>();
const tenant = (db: string) => tenants.get(db) ?? tenants.set(db, fakeTenantConnection(UNIQUE)).get(db)!;
const tenantService = {
  getModel: (db: string, name: string) => tenant(db).getModel(db, name),
  getTenantConnection: () => ({}),
  getGlobalConnection: () => ({}),
};
const global = { Establishment: new FakeModel(['slug']), UserDirectory: new FakeModel(), ReferenceCategory: new FakeModel(['slug']) };
const fakeConnection: any = { model: () => new FakeModel(), models: {}, useDb: () => fakeConnection, close: async () => undefined };

(async () => {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken(GLOBAL_CONNECTION))
    .useValue(fakeConnection)
    .overrideProvider(TenantConnectionService)
    .useValue(tenantService);
  for (const [name, model] of Object.entries(global)) builder.overrideProvider(getModelToken(name, GLOBAL_CONNECTION)).useValue(model);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();

  // ─── Données de démonstration ───
  const db = 'zaff_tenant_boutique_test';
  await global.Establishment.create({ name: 'Boutique Test', slug: 'boutique-test', databaseName: db, currency: 'F CFA', status: 'active', settings: {} });
  const password = await bcrypt.hash('secret', 10);
  const users = tenant(db).getModel(db, 'TenantUser');
  const [owner, , storekeeper] = await Promise.all([
    users.create({ name: 'Patron', phone: '+2250700000001', password, role: 'admin', isActive: true }),
    users.create({ name: 'Awa', phone: '+2250700000002', password, role: 'seller', isActive: true }),
    users.create({ name: 'Koné', phone: '+2250700000003', password, role: 'storekeeper', isActive: true }),
  ]);
  const products = tenant(db).getModel(db, 'Product');
  const iphone = await products.create({
    name: 'iPhone 15 Pro', sku: 'IPH15P-256', category: 'smartphones', brand: 'Apple', model: '256 Go', color: 'Titane naturel',
    barcode: '0194253401230', purchasePrice: 700000, salePrice: 850000, stockQuantity: 0, minStockAlert: 1, hasSerialNumbers: true,
  });
  await app.get(UnitsService).addUnits(db, { productId: String(iphone._id), serialNumbers: ['IMEI0001', 'IMEI0002', 'IMEI0003', 'IMEI0004'] }, { userId: String(storekeeper._id), name: 'Koné' });
  void owner;

  const port = Number(process.env.PORT || 8000);
  await app.listen(port);
  console.log(`Backend en mémoire prêt : http://localhost:${port}/api (comptes +2250700000001/2/3, mot de passe « secret »)`);
})().catch((e) => {
  console.error('MEMORY SERVER FAILED', e);
  process.exit(1);
});
