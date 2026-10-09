import { FakeModel } from '../../../testing/fake-model';
import { ImagesService } from '../images/images.service';
import { DevicesService } from './devices.service';
import { DEVICE_MODELS } from '../../../common/catalog/device-catalog';

const jpeg = (n: number) => ({ buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, n)]), size: 104 });

describe('Catalogue global des appareils (administrateur)', () => {
  let devices: DevicesService;
  let images: ImagesService;
  let imageModel: FakeModel;

  beforeEach(async () => {
    imageModel = new FakeModel(['sha256']);
    images = new ImagesService(imageModel as any);
    devices = new DevicesService(new FakeModel() as any, images);
    await devices.onModuleInit();
  });

  it('premier démarrage : le catalogue est rempli avec les appareils connus, lisible par les boutiques', async () => {
    const stats = await devices.stats();
    expect(stats.devices).toBeGreaterThan(200);
    expect(stats.missingPhotos).toBe(stats.devices);
    const catalog = await devices.catalog();
    const iphone = catalog.models.smartphones.Apple.find((m) => m.name === 'iPhone 15 Pro')!;
    expect(iphone).toMatchObject({ variants: expect.arrayContaining(['256 Go']), colors: expect.arrayContaining(['Titane naturel']), photos: [], imageId: null });
    expect(Object.keys(catalog.models)).toEqual(expect.arrayContaining(Object.keys(DEVICE_MODELS)));
    await devices.onModuleInit(); // pas de doublon au redémarrage
    expect((await devices.stats()).devices).toBe(stats.devices);
  });

  it('création / modification : doublon refusé (marque + modèle, même écrit autrement)', async () => {
    const d = await devices.create({ category: 'smartphones', brand: 'Tecno', model: 'Camon 50', variants: ['256 Go', ' 256 Go ', ''], colors: ['Noir'] });
    expect(d.variants).toEqual(['256 Go']);
    await expect(devices.create({ category: 'smartphones', brand: 'TECNO', model: 'Tecno camon-50' })).rejects.toThrow(/existe déjà/);
    const u = await devices.update(d.id, { colors: ['Noir', 'Bleu'], active: false });
    expect(u).toMatchObject({ colors: ['Noir', 'Bleu'], active: false });
    const catalog = await devices.catalog();
    expect(catalog.models.smartphones.Tecno.some((m) => m.name === 'Camon 50')).toBe(false); // masqué des boutiques
  });

  it('photos par coloris : la 1re devient la photo par défaut, proposée aux boutiques, liée à l\'appareil', async () => {
    const { items } = await devices.list({ search: 'galaxy a55' });
    const a55 = items[0];
    const r1 = await devices.addPhoto(a55.id, jpeg(1), undefined, 'Bleu glacé');
    const r2 = await devices.addPhoto(a55.id, jpeg(2), undefined, 'Noir');
    expect(r2.device.photos).toHaveLength(2);
    expect(r2.device.imageId).toBe(r1.image.id);
    expect(r2.device.colors).toEqual(expect.arrayContaining(['Bleu glacé', 'Noir']));
    expect(imageModel.docs.find((d) => String(d._id) === r1.image.id)).toMatchObject({ deviceId: a55.id, library: true, pending: false });
    // Côté boutique : la recherche de photos du modèle (avec ou sans la marque) les trouve
    expect(await images.search({ brand: 'Samsung', model: 'Samsung Galaxy A55 5G', color: 'Noir' })).toHaveLength(2);
    expect((await images.search({ brand: 'Samsung', model: 'Galaxy A55 5G', color: 'Noir' }))[0].id).toBe(r2.image.id);
    await devices.setDefaultPhoto(a55.id, r2.image.id);
    expect((await devices.get(a55.id)).imageId).toBe(r2.image.id);
    expect((await devices.list({ photos: 'with' })).total).toBe(1);
  });

  it('retrait : photo effacée si aucun produit ne l\'utilise, sinon masquée (les produits la gardent)', async () => {
    const { items } = await devices.list({ search: 'iphone 15 pro max' });
    const dev = items[0];
    const a = (await devices.addPhoto(dev.id, jpeg(3), undefined, null)).image;
    const b = (await devices.addPhoto(dev.id, jpeg(4), undefined, null)).image;
    await images.attach(b.id); // une boutique l'utilise
    expect(await devices.removePhoto(dev.id, a.id)).toMatchObject({ deleted: true });
    expect(imageModel.docs.find((d) => String(d._id) === a.id)).toBeUndefined();
    const r = await devices.removePhoto(dev.id, b.id);
    expect(r).toMatchObject({ deleted: false, hidden: true });
    expect(r.device.photos).toEqual([]);
    expect(await images.search({ brand: 'Apple', model: 'iPhone 15 Pro Max' })).toEqual([]);
  });

  it('photo signalée : l\'administrateur la garde ou la retire de son appareil', async () => {
    const { items } = await devices.list({ search: 'spark 20' });
    const img = (await devices.addPhoto(items[0].id, jpeg(5), undefined, null)).image;
    await images.report(img.id, '64b000000000000000000001');
    expect((await devices.stats()).reported).toBe(1);
    await images.clearReports(img.id);
    expect((await images.reported()).length).toBe(0);
    await images.report(img.id, '64b000000000000000000002');
    await devices.removeReportedPhoto(img.id);
    expect((await devices.get(items[0].id)).photos).toEqual([]);
  });

  it('recherche mot par mot dans marque + modèle (« Acer Nitro V 15 », « nitro 15 », « galaxy a55 »)', async () => {
    const names = async (search: string) => (await devices.list({ search })).items.map((d) => `${d.brand} ${d.model}`);
    expect(await names('Acer Nitro V 15')).toEqual(['Acer Nitro V 15']);
    expect(await names('nitro 15')).toEqual(['Acer Nitro V 15']);
    expect(await names('samsung galaxy a55')).toEqual(['Samsung Galaxy A55 5G']);
    expect((await devices.list({ search: 'Apple Watch Ultra 3' })).items.map((d) => d.model)).toEqual(['Apple Watch Ultra 3']);
    expect((await devices.list({ search: 'inexistant 999' })).total).toBe(0);
  });

  it('fiche complétée par l\'IA : valeurs listées, « à vérifier » jusqu\'à la relecture de l\'admin', async () => {
    const d = (await devices.list({ search: 'nitro v 15' })).items[0];
    const changed = await devices.applyAiFacts(d.id, { colors: [{ name: 'Noir obsidienne', hex: '#111111' }], specs: [{ label: 'Écran', value: '15,6" 144 Hz' }] });
    expect(changed).toEqual(['coloris (Noir obsidienne)', 'codes couleur', 'fiche technique (1 ligne)']);
    expect((await devices.stats()).aiToCheck).toBe(1);
    expect((await devices.list({ review: 'ai' })).items.map((x) => x.id)).toEqual([d.id]);
    expect(await devices.applyAiFacts(d.id, { colors: [{ name: 'Rouge', hex: '#ff0000' }] })).toEqual([]); // déjà complet : rien
    await devices.markAiChecked(d.id);
    expect((await devices.stats()).aiToCheck).toBe(0);
    expect((await devices.get(d.id)).colors).toEqual(['Noir obsidienne']);
  });
});
