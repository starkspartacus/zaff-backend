import { Types } from 'mongoose';
import { FakeModel, fakeTenantConnection } from '../../../testing/fake-model';
import { ImagesService, imageKey, modelKeyOf, PENDING_TTL_MS, sniffImage } from './images.service';
import { UploadThingClient, UploadThingStorage, RemoteFile, cleanUploadThingToken, uploadThingTokenProblem } from './media-storage';
import { CatalogService } from '../../tenant/catalog/catalog.service';

const jpeg = (n = 1) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, n)]);
const file = (n = 1) => ({ buffer: jpeg(n), size: 204 });
const shopA = { establishmentId: new Types.ObjectId().toString(), establishmentName: 'Boutique A', name: 'Koné' };
const shopB = { establishmentId: new Types.ObjectId().toString(), establishmentName: 'Boutique B', name: 'Awa' };
const meta = { brand: 'Samsung', model: 'Galaxy A55 5G', color: 'Noir', category: 'smartphones' };

/** Faux UploadThing : garde les fichiers en mémoire */
class FakeUploadThing implements UploadThingClient {
  files = new Map<string, RemoteFile>();
  n = 0;
  failNext = false;
  badToken = false;
  async uploadFiles(f: any) {
    if (this.badToken) return { data: null, error: { message: 'Invalid signing secret' } };
    if (this.failNext) {
      this.failNext = false;
      return { data: null, error: { message: 'panne' } };
    }
    const key = `k${++this.n}_${f.name}`;
    this.files.set(key, { key, customId: f.customId ?? null, uploadedAt: Date.now() });
    return { data: { key, ufsUrl: `https://app.ufs.sh/f/${key}` }, error: null };
  }
  async deleteFiles(keys: string[]) {
    keys.forEach((k) => this.files.delete(k));
    return { success: true, deletedCount: keys.length };
  }
  async listFiles() {
    return { files: [...this.files.values()], hasMore: false };
  }
}

describe("Photos partagées : UploadThing, sans fichier orphelin", () => {
  let ut: FakeUploadThing;
  let model: FakeModel;
  let images: ImagesService;
  const doc = (id: string) => model.docs.find((d) => String(d._id) === id);

  beforeEach(() => {
    ut = new FakeUploadThing();
    model = new FakeModel(['sha256']);
    images = new ImagesService(model as any, new UploadThingStorage(ut));
  });

  it('envoi : fichier chez UploadThing, fiche « en attente », servi par redirection, pas proposé aux autres tant qu\'en attente', async () => {
    const img = await images.upload(file(1), meta, shopA);
    expect(img).toMatchObject({ pending: true, library: false, duplicate: false });
    expect(ut.files.size).toBe(1);
    const f = await images.file(img.id);
    expect(f.url).toMatch(/^https:\/\/app\.ufs\.sh\/f\//);
    expect(doc(img.id).data).toBeNull();
    expect(await images.search(meta)).toEqual([]);
    await images.attach(img.id);
    expect(await images.search(meta)).toHaveLength(1);
    // Nom affiché avec la marque (« Samsung Galaxy A55 5G ») : même photo
    expect(await images.search({ ...meta, model: 'Samsung Galaxy A55 5G' })).toHaveLength(1);
  });

  it('UploadThing refuse le jeton (« Invalid signing secret ») : photo gardée dans MongoDB, le produit peut s\'enregistrer', async () => {
    ut.badToken = true;
    const img = await images.upload(file(9), meta, shopA, { shopOnly: true, thumb: { buffer: jpeg(3), size: 204 } });
    expect(doc(img.id)).toMatchObject({ storage: 'database', storageKey: null, url: null });
    const f = await images.file(img.id);
    expect([f.url, Buffer.from(f.data!).length]).toEqual([null, 204]);
    // Panne réseau d'UploadThing : la photo est gardée aussi (jamais perdue)
    ut.badToken = false;
    ut.failNext = true;
    const down = await images.upload(file(10), meta, shopA);
    expect(doc(down.id)).toMatchObject({ storage: 'database' });
  });

  it('photos gardées dans MongoDB renvoyées chez UploadThing dès qu\'il répond, même adresse publique', async () => {
    ut.badToken = true;
    const img = await images.upload(file(11), meta, shopA, { thumb: { buffer: jpeg(4), size: 204 } });
    await images.attach(img.id);
    expect(await images.pushToRemote()).toBe(0); // toujours refusé
    ut.badToken = false;
    expect(await images.pushToRemote()).toBe(1);
    expect(doc(img.id)).toMatchObject({ storage: 'uploadthing', data: null, thumbData: null });
    expect((await images.file(img.id)).url).toMatch(/^https:\/\/app\.ufs\.sh\/f\//);
    expect(ut.files.size).toBe(2);
  });

  it('jeton UploadThing : guillemets retirés, jeton incomplet expliqué sans être affiché', () => {
    const v7 = Buffer.from(JSON.stringify({ apiKey: 'sk_live_x', appId: 'abc', regions: ['sea1'] })).toString('base64');
    expect(cleanUploadThingToken(`  "${v7}" `)).toBe(v7);
    expect(uploadThingTokenProblem(v7)).toBeNull();
    expect(uploadThingTokenProblem('sk_live_1234567890abcdef')).toMatch(/V7/);
    expect(uploadThingTokenProblem(Buffer.from(JSON.stringify({ apiKey: 'sk_live_x' })).toString('base64'))).toMatch(/appId/);
  });

  it('photo prise par une boutique : visible et utilisable par elle seule, effacée si le produit ne la garde pas', async () => {
    const img = await images.upload(file(7), meta, shopA, { shopOnly: true });
    await images.attach(img.id, shopA.establishmentId);
    expect((await images.search(meta, shopA.establishmentId)).map((x: any) => x.id)).toEqual([img.id]);
    expect(await images.search(meta, 'autre-boutique')).toEqual([]);
    await expect(images.attach(img.id, 'autre-boutique')).rejects.toThrow(/indisponible/);
    await expect(images.upload(file(7), meta, { ...shopA, establishmentId: new Types.ObjectId().toString() }, { shopOnly: true })).rejects.toThrow(/autre boutique/);
    await images.release(img.id);
    expect(doc(img.id)).toBeUndefined();
    expect(ut.files.size).toBe(0);
  });

  it('remplacement de la photo d\'un produit : l\'ancienne est effacée chez UploadThing et dans la base', async () => {
    const conn = fakeTenantConnection();
    const catalog = new CatalogService(conn as any, images);
    const db = 'zaff_tenant_test';
    const first = await images.upload(file(1), meta, shopA);
    const product: any = await catalog.createProduct(db, { name: 'Samsung Galaxy A55 5G', sku: 'A55', category: 'smartphones', purchasePrice: 0, salePrice: 225000, imageId: first.id } as any);
    expect(doc(first.id)).toMatchObject({ pending: false, usage: 1 });

    const second = await images.upload(file(2), { ...meta, color: 'Bleu' }, shopA);
    await catalog.updateProduct(db, String(product._id), { imageId: second.id });
    expect(doc(first.id)).toBeUndefined();
    expect(ut.files.size).toBe(1);
    expect(doc(second.id)).toMatchObject({ usage: 1, pending: false });

    // Photo retirée puis produit supprimé : plus rien ne reste
    await catalog.updateProduct(db, String(product._id), { imageId: null });
    expect(doc(second.id)).toBeUndefined();
    expect(ut.files.size).toBe(0);
  });

  it('photo partagée par deux produits : gardée tant qu\'un produit l\'utilise ; produit supprimé → photo libérée', async () => {
    const conn = fakeTenantConnection();
    const catalog = new CatalogService(conn as any, images);
    const img = await images.upload(file(3), meta, shopA);
    const p1: any = await catalog.createProduct('db1', { name: 'A55', sku: 'A1', category: 'smartphones', purchasePrice: 0, salePrice: 1, imageId: img.id } as any);
    const p2: any = await catalog.createProduct('db1', { name: 'A55', sku: 'A2', category: 'smartphones', purchasePrice: 0, salePrice: 1, imageId: img.id } as any);
    await catalog.deleteProduct('db1', String(p1._id));
    expect(doc(img.id)).toMatchObject({ usage: 1 });
    await catalog.deleteProduct('db1', String(p2._id));
    expect(doc(img.id)).toBeUndefined();
    expect(ut.files.size).toBe(0);
  });

  it('produit non enregistré (erreur) : la photo envoyée est libérée, et une photo inexistante est refusée', async () => {
    const conn = fakeTenantConnection();
    const catalog = new CatalogService(conn as any, images);
    await catalog.createProduct('db1', { name: 'X', sku: 'DUP', category: 'smartphones', purchasePrice: 0, salePrice: 1 } as any);
    const img = await images.upload(file(4), meta, shopA);
    await expect(catalog.createProduct('db1', { name: 'X', sku: 'DUP', category: 'smartphones', purchasePrice: 0, salePrice: 1, imageId: img.id } as any)).rejects.toThrow(/existe déjà/);
    // le doublon de SKU est détecté avant : la photo reste en attente, le navigateur l'annule
    expect(await images.discard(img.id, shopB.establishmentId)).toEqual({ deleted: false });
    expect(await images.discard(img.id, shopA.establishmentId)).toEqual({ deleted: true });
    expect(ut.files.size).toBe(0);
    await expect(catalog.createProduct('db1', { name: 'Y', sku: 'Y', category: 'smartphones', purchasePrice: 0, salePrice: 1, imageId: new Types.ObjectId().toString() } as any)).rejects.toThrow(/n'existe plus/);
  });

  it("panne d'UploadThing : la photo n'est pas perdue (gardée dans MongoDB, aucun fichier distant)", async () => {
    ut.failNext = true;
    const img = await images.upload(file(5), meta, shopA);
    expect(model.docs).toHaveLength(1);
    expect([doc(img.id).storage, ut.files.size]).toEqual(['database', 0]);
  });

  it('photothèque (import en masse) : gardée sans produit ; suppression refusée si utilisée', async () => {
    const lib = await images.upload(file(6), meta, shopA, { library: true });
    expect(lib).toMatchObject({ library: true, pending: false });
    expect(await images.search(meta)).toHaveLength(1);
    await images.attach(lib.id);
    await images.release(lib.id);
    expect(doc(lib.id)).toBeDefined(); // photothèque : pas effacée à usage 0
    await images.attach(lib.id);
    await expect(images.remove(lib.id, shopA.establishmentId)).rejects.toThrow(/utilisée par 1 produit/);
    await images.release(lib.id);
    await expect(images.remove(lib.id, shopB.establishmentId)).rejects.toThrow(/autre boutique/);
    await expect(images.remove(lib.id, shopA.establishmentId)).resolves.toEqual({ deleted: true });
    expect(ut.files.size).toBe(0);
    expect((await images.mine(shopA.establishmentId)).length).toBe(0);
  });

  it('même photo envoyée deux fois : stockée une seule fois (et promue en photothèque si importée)', async () => {
    const a = await images.upload(file(7), meta, shopA);
    const b = await images.upload(file(7), meta, shopB, { library: true });
    expect(b).toMatchObject({ id: a.id, duplicate: true, library: true });
    expect(ut.files.size).toBe(1);
  });

  it('nettoyage horaire : photos abandonnées et fichiers UploadThing sans fiche supprimés, le reste gardé', async () => {
    const abandoned = await images.upload(file(8), meta, shopA);
    const kept = await images.upload(file(9), meta, shopA);
    await images.attach(kept.id);
    const lib = await images.upload(file(10), meta, shopA, { library: true });
    ut.files.set('orphelin', { key: 'orphelin', customId: 'zaff-abc', uploadedAt: 0 });
    ut.files.set('autre-appli', { key: 'autre-appli', customId: 'autre', uploadedAt: 0 });
    const later = Date.now() + PENDING_TTL_MS + 1000;
    for (const f of ut.files.values()) (f as any).uploadedAt = Math.min(f.uploadedAt, later - PENDING_TTL_MS - 10);

    expect(await images.cleanup(later)).toEqual({ pending: 1, remote: 1, pushed: 0 });
    expect(doc(abandoned.id)).toBeUndefined();
    expect(doc(kept.id)).toBeDefined();
    expect(doc(lib.id)).toBeDefined();
    expect(ut.files.has('autre-appli')).toBe(true); // jamais les fichiers d'un autre usage du compte
    expect(ut.files.size).toBe(3);
  });

  it('refuse ce qui n\'est pas une image, trop lourd, ou sans modèle ; sans UploadThing, stockage MongoDB', async () => {
    await expect(images.upload({ buffer: Buffer.from('<svg onload=alert(1)>'), size: 20 }, meta, shopA)).rejects.toThrow(/Format non reconnu/);
    await expect(images.upload({ buffer: jpeg(), size: 700 * 1024 }, meta, shopA)).rejects.toThrow(/trop lourde/);
    await expect(images.upload(file(), { brand: ' ', model: 'Y' }, shopA)).rejects.toThrow(/marque et le modèle/);
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(imageKey('  Galaxy  A55-5G ')).toBe('galaxy a55 5g');
    expect(modelKeyOf('Samsung', 'Samsung Galaxy A55 5G')).toBe(modelKeyOf('samsung', 'Galaxy A55 5G'));

    const local = new ImagesService(new FakeModel(['sha256']) as any);
    const img = await local.upload(file(11), meta, shopA);
    const f = await local.file(img.id);
    expect(f.url).toBeNull();
    expect(f.data?.length).toBe(204);
  });

  it('vignette : stockée avec la photo, servie à part, effacée avec elle', async () => {
    const thumb = { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50, 9)]), size: 54 };
    const img = await images.upload(file(20), meta, shopA, { thumb });
    expect(img.hasThumb).toBe(true);
    expect(ut.files.size).toBe(2);
    expect((await images.file(img.id, 'thumb')).url).toMatch(/vignette/);
    expect((await images.file(img.id)).url).not.toMatch(/vignette/);
    await images.discard(img.id, shopA.establishmentId);
    expect(ut.files.size).toBe(0);
    await expect(images.upload(file(21), meta, shopA, { thumb: { buffer: Buffer.from('pas une image'), size: 13 } })).rejects.toThrow(/Vignette invalide/);
    // Sans vignette : la photo complète est servie
    const local = new ImagesService(new FakeModel(['sha256']) as any);
    const plain = await local.upload(file(22), meta, shopA);
    expect((await local.file(plain.id, 'thumb')).data?.length).toBe(204);
  });

  it('signalement : 3 boutiques différentes masquent la photo de la base partagée, pas la sienne', async () => {
    const img = await images.upload(file(23), meta, shopA, { library: true });
    const shopC = new Types.ObjectId().toString();
    const shopD = new Types.ObjectId().toString();
    await expect(images.report(img.id, shopA.establishmentId)).rejects.toThrow(/votre boutique/);
    expect(await images.report(img.id, shopB.establishmentId)).toEqual({ reported: true, hidden: false });
    expect(await images.report(img.id, shopB.establishmentId)).toEqual({ reported: true, hidden: false }); // compté une fois
    await images.report(img.id, shopC);
    expect(await images.search(meta)).toHaveLength(1);
    expect(await images.report(img.id, shopD)).toEqual({ reported: true, hidden: true });
    expect(await images.search(meta)).toEqual([]);
    expect((await images.mine(shopA.establishmentId))[0]).toMatchObject({ hidden: true, reports: 3 });
  });

  it('espace utilisé : base partagée, ma boutique, quota du fournisseur', async () => {
    await images.upload(file(24), meta, shopA, { library: true });
    await images.upload(file(25), meta, shopB, { library: true });
    const u = await images.usage(shopA.establishmentId);
    expect(u).toMatchObject({ storage: 'uploadthing', shared: { photos: 2, bytes: 408 }, mine: { photos: 1, bytes: 204, library: 1 } });
  });
});
