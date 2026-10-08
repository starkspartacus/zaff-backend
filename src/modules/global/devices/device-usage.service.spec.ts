import { FakeModel } from '../../../testing/fake-model';
import { ImagesService } from '../images/images.service';
import { DevicesService } from './devices.service';
import { DeviceUsageService } from './device-usage.service';

const jpeg = (n: number) => ({ buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, n)]), size: 104 });
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};

describe('Catalogue global ↔ produits des boutiques', () => {
  let devices: DevicesService;
  let usage: DeviceUsageService;
  let images: ImagesService;
  let deviceModel: FakeModel;
  let requestModel: FakeModel;
  let imageModel: FakeModel;
  let establishments: FakeModel;
  const tenantModels: Record<string, FakeModel> = {};
  const products = (db: string) => (tenantModels[`${db}:Product`] ??= new FakeModel());
  const invalidated: string[] = [];

  beforeEach(async () => {
    for (const k of Object.keys(tenantModels)) delete tenantModels[k];
    invalidated.length = 0;
    deviceModel = new FakeModel();
    requestModel = new FakeModel();
    imageModel = new FakeModel(['sha256']);
    establishments = new FakeModel();
    images = new ImagesService(imageModel as any);
    const tenants = { getModel: (db: string, name: string) => (tenantModels[`${db}:${name}`] ??= new FakeModel()) };
    const realtime = { invalidate: (db: string) => invalidated.push(db) };
    usage = new DeviceUsageService(deviceModel as any, requestModel as any, establishments as any, tenants as any, images, realtime as any);
    devices = new DevicesService(deviceModel as any, images, requestModel as any, usage);
    await devices.onModuleInit();
    for (const db of ['shop_a', 'shop_b']) await establishments.create({ databaseName: db, status: 'active' });
  });

  const addProduct = async (db: string, data: Record<string, unknown>) => {
    const p = await products(db).create({ imageId: null, deviceId: null, ...data });
    await usage.track(db, p);
    return p;
  };
  const a55 = async () => (await devices.list({ search: 'galaxy a55' })).items[0];

  it('produit d\'un appareil connu : rattaché (même saisi à la main), compté, et reçoit la photo dès que l\'admin l\'ajoute', async () => {
    const dev = await a55();
    const p1 = await addProduct('shop_a', { brand: 'Samsung', name: 'Samsung Galaxy A55 5G', color: 'Noir' });
    const p2 = await addProduct('shop_b', { brand: 'samsung', name: 'Galaxy A55 5G', color: 'Bleu glacé', deviceId: dev.id });
    expect(p1.deviceId).toBe(dev.id);
    expect((await devices.get(dev.id)).shops).toBe(2);
    expect((await devices.list({ sort: 'popular' })).items[0].id).toBe(dev.id); // à photographier en premier
    expect((await devices.stats()).usedDevices).toBe(1);

    // Photo du coloris Bleu glacé puis Noir : chaque produit reçoit celle de son coloris
    await devices.addPhoto(dev.id, jpeg(1), undefined, 'Bleu glacé');
    await flush();
    expect(p1.imageId).toBeTruthy(); // pas encore de photo noire : la photo par défaut
    const blue = p2.imageId;
    expect(blue).toBe(p1.imageId);
    expect(imageModel.docs.find((d) => String(d._id) === blue).usage).toBe(2);
    expect(invalidated).toEqual(expect.arrayContaining(['shop_a', 'shop_b']));

    // Un produit qui a déjà une photo n'est jamais modifié
    await devices.addPhoto(dev.id, jpeg(2), undefined, 'Noir');
    await flush();
    expect(p1.imageId).toBe(blue);
    const p3 = await addProduct('shop_a', { brand: 'Samsung', name: 'Galaxy A55 5G', color: 'Noir' });
    expect(p3.imageId).not.toBe(blue); // nouveau produit noir : la photo noire
    expect((await devices.stats()).usedWithPhotos).toBe(1);
  });

  it('modèle inconnu : une demande d\'ajout par modèle, comptée par boutique ; acceptée → produits rattachés, puis photo transmise', async () => {
    const p1 = await addProduct('shop_a', { category: 'smartphones', brand: 'Tecno', name: 'Pova 7 Ultra', color: 'Vert', model: '256 Go' });
    await addProduct('shop_a', { category: 'smartphones', brand: 'Tecno', name: 'Pova 7 Ultra', color: 'Noir' });
    const p3 = await addProduct('shop_b', { category: 'smartphones', brand: 'TECNO', name: 'Tecno Pova 7 Ultra' });
    let open = await devices.requestsList();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ brand: 'Tecno', model: 'Pova 7 Ultra', variants: ['256 Go'], shops: 2, colors: ['Vert', 'Noir'] });
    expect(JSON.stringify(open)).not.toContain('shop_a'); // jamais le nom interne des boutiques
    expect((await devices.stats()).requests).toBe(1);

    const { device, linked } = await devices.acceptRequest(open[0].id, { category: 'smartphones', brand: 'Tecno', model: 'Pova 7 Ultra', colors: ['Vert', 'Noir'] });
    expect(linked).toBe(3);
    expect(p1.deviceId).toBe(device.id);
    expect(p3.deviceId).toBe(device.id);
    expect(device.shops).toBe(2);
    expect(await devices.requestsList()).toHaveLength(0);
    expect((await devices.catalog()).models.smartphones.Tecno.some((m) => m.name === 'Pova 7 Ultra')).toBe(true);

    await devices.addPhoto(device.id, jpeg(3), undefined, null);
    await flush();
    expect(p1.imageId).toBeTruthy();
    expect(p3.imageId).toBe(p1.imageId);

    // Demande ignorée : n'est plus proposée
    await addProduct('shop_a', { brand: 'Marque X', name: 'Bidule 3' });
    open = await devices.requestsList();
    await devices.dismissRequest(open[0].id);
    expect(await devices.requestsList()).toHaveLength(0);
    expect(await devices.requestsList('dismissed')).toHaveLength(1);
  });

  it('recalcul : anciens produits rattachés, produits supprimés décomptés, demandes sans boutique retirées', async () => {
    const dev = await a55();
    await devices.addPhoto(dev.id, jpeg(4), undefined, null);
    // Produits créés avant le suivi (directement en base)
    const old = await products('shop_a').create({ brand: 'Samsung', name: 'Galaxy A55 5G', imageId: null, deviceId: null });
    await products('shop_b').create({ brand: 'Inconnu', name: 'Z1', imageId: null, deviceId: null });
    const gone = await addProduct('shop_b', { brand: 'Samsung', name: 'Galaxy A55 5G' });
    await addProduct('shop_a', { brand: 'Autre', name: 'Y2' });
    await products('shop_b').deleteOne({ _id: gone._id });
    await products('shop_a').deleteMany({ brand: 'Autre' });

    const r = await devices.sync();
    expect(r).toMatchObject({ shops: 2, devicesUsed: 1, requests: 1 });
    expect(old.deviceId).toBe(dev.id);
    expect(old.imageId).toBe((await devices.get(dev.id)).imageId);
    expect((await devices.get(dev.id)).shops).toBe(1);
    expect((await devices.requestsList()).map((x) => x.model)).toEqual(['Z1']);
  });

  it('fiche technique : nettoyée et transmise aux boutiques avec le catalogue', async () => {
    const d = await devices.create({
      category: 'smartphones',
      brand: 'Infinix',
      model: 'Note 99 Test',
      specs: [{ label: ' Écran ', value: '6,78" AMOLED 144 Hz' }, { label: 'RAM', value: '' }, { label: 'Batterie', value: '5200 mAh' }],
    });
    expect(d.specs).toEqual([{ label: 'Écran', value: '6,78" AMOLED 144 Hz' }, { label: 'Batterie', value: '5200 mAh' }]);
    const m = (await devices.catalog()).models.smartphones.Infinix.find((x) => x.name === 'Note 99 Test')!;
    expect(m.specs).toHaveLength(2);
    expect((await devices.update(d.id, { specs: [] })).specs).toEqual([]);
  });

  it('un échec du suivi ne bloque jamais l\'enregistrement du produit', async () => {
    const broken = new DeviceUsageService({ findOne: () => { throw new Error('panne'); } } as any, requestModel as any, establishments as any, { getModel: () => products('x') } as any, images);
    await expect(broken.track('shop_a', { _id: 'x', brand: 'A', name: 'B' })).resolves.toBeUndefined();
  });
});
