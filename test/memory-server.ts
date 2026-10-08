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
import { DirectoryService } from '../src/modules/global/directory/directory.service';
import { TenantConnectionService } from '../src/database/tenant-connection.service';
import { DevicesService } from '../src/modules/global/devices/devices.service';
import sharp from 'sharp';
import { AI_CLIENT } from '../src/modules/global/ai-images/gemini.client';
import { PAGE_FETCHER } from '../src/modules/global/ai-images/ai-images.service';
import { FakeModel, fakeTenantConnection } from '../src/testing/fake-model';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { UnitsService } from '../src/modules/tenant/units/units.service';

process.env.MONGODB_URI ||= 'mongodb://memoire';
process.env.JWT_SECRET ||= 'memory-server-secret';
// Espace administrateur de démonstration (/admin)
process.env.PLATFORM_ADMIN_EMAIL ||= 'admin@zaff.app';
process.env.PLATFORM_ADMIN_PASSWORD ||= 'admin-zaff-demo';

const UNIQUE = { ProductUnit: ['serialNumber'], CreditNote: ['code'], ProductReturn: ['returnNumber'], PushSubscriptionRecord: ['endpoint'] };
const tenants = new Map<string, ReturnType<typeof fakeTenantConnection>>();
const tenant = (db: string) => tenants.get(db) ?? tenants.set(db, fakeTenantConnection(UNIQUE)).get(db)!;
const tenantService = {
  getModel: (db: string, name: string) => tenant(db).getModel(db, name),
  getTenantConnection: () => ({}),
  getGlobalConnection: () => ({}),
};
const global = { Establishment: new FakeModel(['slug']), UserDirectory: new FakeModel(), ReferenceCategory: new FakeModel(['slug']), CatalogImage: new FakeModel(['sha256']), GlobalDevice: new FakeModel(), DeviceRequest: new FakeModel(), AiImageJob: new FakeModel(), AiImageCandidate: new FakeModel() };
// ─── IA de démonstration : trois « photos » par appareil, notées comme le ferait Gemini ───
const demoColors = ['#1f2937', '#93c5fd', '#c4b5fd'];
const demoAi = {
  enabled: true,
  model: 'démo (sans clé Gemini)',
  async generate(req: { parts: Array<{ text?: string }>; search?: boolean }) {
    const prompt = req.parts.map((p) => p.text || '').join(' ');
    const name = (prompt.match(/"([^"]+)"/) || [])[1] || 'appareil';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (req.search) {
      return { text: JSON.stringify({ images: demoColors.map((_, i) => ({ url: `https://demo.zaff.app/${slug}-${i}.png`, page: 'https://demo.zaff.app/' + slug, color: ['Noir', 'Bleu', 'Violet'][i] })) }), sources: [] };
    }
    const n = req.parts.filter((p: any) => p.image).length;
    const images = Array.from({ length: n }, (_, i) => ({
      index: i, sameModel: i < 2, productPhoto: true, view: 'front', color: ['Noir', 'Bleu', 'Violet'][i], cleanBackground: true,
      textOrWatermark: false, score: [95, 78, 88][i] ?? 60, reason: ['Vue de face officielle, fond blanc', 'Bonne photo, légèrement de biais', 'Ce n\'est pas le même modèle'][i] ?? 'Photo correcte',
    }));
    return { text: JSON.stringify({ images }), sources: [] };
  },
};
const demoFetcher = async (url: string) => {
  const i = Number((url.match(/-(\d)\.png$/) || [])[1] ?? 0);
  const buffer = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 420, height: 820, channels: 3, background: demoColors[i] || '#999' } }, gravity: 'center' }])
    .png()
    .toBuffer();
  return { buffer, contentType: 'image/png', url };
};

const fakeConnection: any = { model: () => new FakeModel(), models: {}, useDb: () => fakeConnection, close: async () => undefined };

(async () => {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken(GLOBAL_CONNECTION))
    .useValue(fakeConnection)
    .overrideProvider(TenantConnectionService)
    .useValue(tenantService);
  for (const [name, model] of Object.entries(global)) builder.overrideProvider(getModelToken(name, GLOBAL_CONNECTION)).useValue(model);
  // Sans GEMINI_API_KEY : IA et Internet simulés (photos générées), pour essayer « Photos par l'IA » hors ligne
  if (!process.env.GEMINI_API_KEY) builder.overrideProvider(AI_CLIENT).useValue(demoAi).overrideProvider(PAGE_FETCHER).useValue(demoFetcher);
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
  const est = await global.Establishment.create({ name: 'Boutique Test', slug: 'boutique-test', databaseName: db, currency: 'F CFA', currencyCode: 'XOF', countryCode: 'CI', city: 'Abidjan', commune: 'Cocody', status: 'active', settings: {} });
  const password = await bcrypt.hash('secret', 10);
  const users = tenant(db).getModel(db, 'TenantUser');
  const [owner, , storekeeper] = await Promise.all([
    users.create({ name: 'Patron', phone: '+2250700000001', password, role: 'admin', isActive: true }),
    users.create({ name: 'Awa', phone: '+2250700000002', password, role: 'seller', isActive: true }),
    users.create({ name: 'Koné', phone: '+2250700000003', password, role: 'storekeeper', isActive: true }),
  ]);
  // Annuaire global : connexion sans boutique et unicité des numéros / e-mails
  const directory = app.get(DirectoryService);
  for (const u of await users.find({}).lean()) await directory.syncUser(est._id, u as never);
  const products = tenant(db).getModel(db, 'Product');
  const iphone = await products.create({
    name: 'iPhone 15 Pro', sku: 'IPH15P-256', category: 'smartphones', brand: 'Apple', model: '256 Go', color: 'Titane naturel',
    barcode: '0194253401230', purchasePrice: 700000, salePrice: 850000, stockQuantity: 0, minStockAlert: 1, hasSerialNumbers: true,
  });
  await app.get(UnitsService).addUnits(db, { productId: String(iphone._id), serialNumbers: ['IMEI0001', 'IMEI0002', 'IMEI0003', 'IMEI0004'] }, { userId: String(storekeeper._id), name: 'Koné' });
  void owner;
  // Modèle absent du catalogue global : apparaît dans les demandes d'ajout de l'administrateur
  await products.create({
    name: 'Tecno Pova Slim 5G', sku: 'TEC-POVA-SLIM', category: 'smartphones', brand: 'Tecno', model: '256 Go', color: 'Bleu',
    purchasePrice: 120000, salePrice: 150000, stockQuantity: 0, minStockAlert: 1, hasSerialNumbers: true,
  });
  console.log('Catalogue global :', JSON.stringify(await app.get(DevicesService).sync()));

  const port = Number(process.env.PORT || 8000);
  await app.listen(port);
  console.log(`Backend en mémoire prêt : http://localhost:${port}/api (comptes +2250700000001/2/3, mot de passe « secret » ; admin plateforme ${process.env.PLATFORM_ADMIN_EMAIL} / ${process.env.PLATFORM_ADMIN_PASSWORD})`);
})().catch((e) => {
  console.error('MEMORY SERVER FAILED', e);
  process.exit(1);
});
