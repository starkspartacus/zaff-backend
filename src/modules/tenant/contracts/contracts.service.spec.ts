import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { ContractsService, maskSerial } from './contracts.service';
import { DEFAULT_ARTICLES, parseBlocks, resolveContract } from './contract-template';
import { WarrantyCodes } from './warranty-code';

const DB = 'zaff_tenant_test';
const actor = { userId: new Types.ObjectId().toString(), name: 'Awa' };
const legal = { legalName: 'ZAFF STORE', legalForm: 'SARL', activity: 'Vente de matériel', rccm: 'CI-ABJ-1', taxId: '24 A', representative: 'Michel, Gérant' };

describe('Contrat de vente et garantie', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let units: UnitsService;
  let contracts: ContractsService;
  let tenant: any;
  let saleId: string;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'] });
    const notifications: any = { notify: async () => undefined, invalidate: () => undefined };
    const sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    tenant = {
      _id: new Types.ObjectId(), name: 'Boutique Test', databaseName: DB, countryCode: 'CI', city: 'Abidjan', commune: 'Cocody',
      address: 'Riviera 2', phone: '+2250700000001', currency: 'F CFA', settings: {},
    };
    const establishments: any = {
      updateSettings: async (_id: string, section: string, value: unknown) => {
        tenant.settings = { ...tenant.settings, [section]: value };
        return tenant;
      },
      findById: async (id: string) => {
        if (String(id) !== String(tenant._id)) throw new Error('introuvable');
        return tenant;
      },
    };
    contracts = new ContractsService(conn as any, establishments, new WarrantyCodes('secret-de-test-assez-long-pour-hmac'));
    const iphone = await conn.getModel(DB, 'Product').create({
      name: 'iPhone 15 Pro', sku: 'IPH15P', category: 'smartphones', brand: 'Apple', model: '256 Go', color: 'Noir',
      salePrice: 850000, stockQuantity: 0, hasSerialNumbers: true, condition: 'refurbished', accessories: 'Câble, boîte',
    });
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI1', 'IMEI2'] }, actor);
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI1', customerName: 'Michel', customerPhone: '+2250701', warrantyMonths: 6 }, actor);
    saleId = String(sale._id);
  });

  it('modèle par défaut : 35 articles du modèle + article retours, numérotés, variables remplacées', async () => {
    const doc = await contracts.forSale(tenant, saleId);
    expect(doc.articles).toHaveLength(DEFAULT_ARTICLES.length);
    expect(doc.articles.map((a) => a.number)).toEqual(DEFAULT_ARTICLES.map((_, i) => i + 1));
    expect(JSON.stringify(doc)).not.toMatch(/\{\{/);
    expect(doc.lawReference).toMatch(/2016-412/);
    expect(doc.documentNumber).toBe('CV-1001');
    expect(doc.customer).toMatchObject({ name: 'Michel', phone: '+2250701' });
    // Données réelles de la vente : appareil, état, accessoires, garantie choisie à la vente
    expect(doc.items[0]).toMatchObject({ serialNumber: 'IMEI1', brand: 'Apple', condition: 'refurbished', accessories: 'Câble, boîte', warrantyMonths: 6, price: 850000 });
    const warranty = doc.articles.find((a) => a.id === 'warranty')!;
    expect(warranty.blocks[0].text).toContain('6 mois');
    expect(warranty.blocks[0].text).toContain('Boutique Test');
  });

  it("l'article retours reprend la politique de la boutique", async () => {
    tenant.settings.returnPolicy = { returnWindowDays: 3, restockingFeePercent: 10 };
    const doc = await contracts.forSale(tenant, saleId);
    const text = doc.articles.find((a) => a.kind === 'returns')!.blocks.map((b) => b.text).join(' ');
    expect(text).toContain('3 jours');
    expect(text).toContain('10 %');
    expect(text).toContain("Emballage d'origine complet");
  });

  it('sans garantie choisie à la vente : garantie par défaut de la boutique (même règle que les retours)', async () => {
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI2' }, actor);
    const doc = await contracts.forSale(tenant, String(sale._id));
    expect(doc.items[0].warrantyMonths).toBe(12);
    expect(doc.customer).toBeNull();
  });

  it('personnalisation : infos légales, article désactivé, modifié et ajouté ; identification toujours présente', async () => {
    const articles = DEFAULT_ARTICLES.filter((a) => a.kind !== 'seller').map((a) =>
      a.id === 'payment' ? { ...a, enabled: false } : a.id === 'claims' ? { ...a, body: 'Appelez {{boutique}} au service client.' } : a,
    );
    articles.push({ id: 'custom-1', title: 'Livraison', body: '- Livraison gratuite à Abidjan', enabled: true, kind: 'text' });
    const saved = await contracts.saveSettings(tenant, { mode: 'custom', legal, warrantyCard: true, articles, title: 'Mon contrat' });
    expect(saved.version).toBe(1);

    // Ventes faites après la modification
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI2' }, actor);
    const doc = await contracts.forSale(tenant, String(sale._id));
    expect(doc.title).toBe('Mon contrat');
    expect(doc.shop.displayName).toBe('ZAFF STORE');
    expect(doc.articles[0].kind).toBe('seller');
    expect(doc.articles.find((a) => a.id === 'payment')).toBeUndefined();
    expect(doc.articles.find((a) => a.id === 'claims')!.blocks[0].text).toBe('Appelez ZAFF STORE au service client.');
    expect(doc.articles.at(-1)).toMatchObject({ title: 'Livraison', blocks: [{ type: 'li', text: 'Livraison gratuite à Abidjan' }] });
  });

  it("une vente garde le texte en vigueur le jour de la vente", async () => {
    const sale = conn.models.Sale.docs.find((s) => String(s._id) === saleId);
    sale.saleDate = new Date(Date.now() - 24 * 3600 * 1000);
    await contracts.saveSettings(tenant, { mode: 'custom', legal, warrantyCard: false, articles: [], title: 'Nouveau titre' });
    const old = await contracts.forSale(tenant, saleId);
    expect(old.title).not.toBe('Nouveau titre');
    expect(old.shop.displayName).toBe('ZAFF STORE'); // infos légales actuelles
  });

  it('retour au modèle par défaut et aperçu', async () => {
    await contracts.saveSettings(tenant, { mode: 'custom', legal, warrantyCard: true, articles: [DEFAULT_ARTICLES[5]] });
    const back = await contracts.saveSettings(tenant, { mode: 'default', legal, warrantyCard: true });
    expect(back.mode).toBe('default');
    expect(back.articles).toHaveLength(DEFAULT_ARTICLES.length);
    expect(back.version).toBe(2);
    const preview = contracts.preview(tenant);
    expect(preview.sample).toBe(true);
    expect(preview.items[0].serialNumber).toBeTruthy();
  });

  it('mise en forme : paragraphes et puces', () => {
    expect(parseBlocks('Intro :\n- un ;\n• deux\n\nFin.')).toEqual([
      { type: 'p', text: 'Intro :' }, { type: 'li', text: 'un ;' }, { type: 'li', text: 'deux' }, { type: 'p', text: 'Fin.' },
    ]);
    expect(resolveContract({ mode: 'custom', articles: [] } as any).mode).toBe('default');
  });

  describe('QR code de vérification de garantie', () => {
    it('chaque appareil du contrat a un code signé, vérifiable sans connexion et sans données du client', async () => {
      const doc = await contracts.forSale(tenant, saleId);
      const code = doc.items[0].verifyCode!;
      expect(code).toMatch(/^[\w-]+\.[\w-]+$/);
      const v = await contracts.verify(code);
      expect(v).toMatchObject({ status: 'active', device: 'with_customer', warrantyMonths: 6, invoiceNumber: 1001 });
      expect(v.product).toMatchObject({ name: 'iPhone 15 Pro', brand: 'Apple' });
      expect(maskSerial('356789104512345')).toBe('356••••••2345');
      expect(v.daysLeft).toBeGreaterThan(150);
      expect(JSON.stringify(v)).not.toMatch(/Michel|2250701|850000/);
    });

    it('code modifié, tronqué ou signé avec un autre secret → refusé', async () => {
      const code = (await contracts.forSale(tenant, saleId)).items[0].verifyCode!;
      const [p, sig] = code.split('.');
      const tampered = `${p.slice(0, -2)}${p.endsWith('A') ? 'B' : 'A'}${p.slice(-1)}.${sig}`;
      await expect(contracts.verify(tampered)).rejects.toThrow(/pas reconnu/);
      await expect(contracts.verify(p)).rejects.toThrow(/pas reconnu/);
      await expect(contracts.verify('n.importe.quoi')).rejects.toThrow(/pas reconnu/);
      const other = new WarrantyCodes('un-autre-secret-tout-aussi-long-que-le-premier');
      await expect(contracts.verify(other.encode(tenant._id, saleId, 0))).rejects.toThrow(/pas reconnu/);
    });

    it("garantie expirée, appareil à l'atelier ou rapporté au magasin", async () => {
      const code = (await contracts.forSale(tenant, saleId)).items[0].verifyCode!;
      const unit = conn.models.ProductUnit.docs.find((u) => u.serialNumber === 'IMEI1');
      unit.status = 'in_repair';
      expect((await contracts.verify(code)).device).toBe('in_repair');
      unit.status = 'in_stock';
      unit.saleId = null;
      expect((await contracts.verify(code)).status).toBe('returned');
      unit.status = 'sold';
      unit.saleId = new Types.ObjectId(saleId);
      for (const w of conn.models.Warranty.docs) w.warrantyEnd = new Date(Date.now() - 24 * 3600 * 1000);
      expect(await contracts.verify(code)).toMatchObject({ status: 'expired', daysLeft: 0 });
    });
  });
});
