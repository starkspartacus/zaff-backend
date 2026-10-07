import { Types } from 'mongoose';
import { FakeModel } from '../../../testing/fake-model';
import { ImagesService, imageKey, sniffImage } from './images.service';

const jpeg = (n = 1) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, n)]);
const shopA = { establishmentId: new Types.ObjectId().toString(), establishmentName: 'Boutique A', name: 'Koné' };
const shopB = { establishmentId: new Types.ObjectId().toString(), establishmentName: 'Boutique B', name: 'Awa' };

describe("Base d'images partagée", () => {
  let images: ImagesService;
  beforeEach(() => {
    images = new ImagesService(new FakeModel(['sha256']) as any);
  });

  it('une photo ajoutée par une boutique est proposée à toutes, la bonne couleur en premier', async () => {
    await images.upload({ buffer: jpeg(1), size: 204 }, { brand: 'Samsung', model: 'Galaxy A55 5G', color: 'Noir', category: 'smartphones' }, shopA);
    const bleu = await images.upload({ buffer: jpeg(2), size: 204 }, { brand: 'samsung', model: 'galaxy a55 5g', color: 'Bleu glacé' }, shopA);
    const found = await images.search({ brand: 'SAMSUNG', model: 'Galaxy A55 5G', color: 'bleu glace' });
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ id: bleu.id, color: 'Bleu glacé', url: `/global/images/${bleu.id}/file`, establishmentName: 'Boutique A' });
    expect(await images.search({ brand: 'Apple', model: 'iPhone 15' })).toEqual([]);
    const file = await images.file(bleu.id);
    expect(file.mime).toBe('image/jpeg');
  });

  it('même photo envoyée deux fois : stockée une seule fois', async () => {
    const a = await images.upload({ buffer: jpeg(3), size: 204 }, { brand: 'Apple', model: 'iPhone 15' }, shopA);
    const b = await images.upload({ buffer: jpeg(3), size: 204 }, { brand: 'Apple', model: 'iPhone 15' }, shopB);
    expect(b.id).toBe(a.id);
  });

  it('refuse ce qui n\'est pas une image, trop lourd, ou sans modèle', async () => {
    await expect(images.upload({ buffer: Buffer.from('<svg onload=alert(1)>'), size: 20 }, { brand: 'X', model: 'Y' }, shopA)).rejects.toThrow(/Format non reconnu/);
    await expect(images.upload({ buffer: jpeg(), size: 700 * 1024 }, { brand: 'X', model: 'Y' }, shopA)).rejects.toThrow(/trop lourde/);
    await expect(images.upload({ buffer: jpeg(), size: 204 }, { brand: ' ', model: 'Y' }, shopA)).rejects.toThrow(/marque et le modèle/);
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(imageKey('  Galaxy  A55-5G ')).toBe('galaxy a55 5g');
  });

  it('seule la boutique qui a ajouté la photo peut la retirer', async () => {
    const img = await images.upload({ buffer: jpeg(4), size: 204 }, { brand: 'Tecno', model: 'Spark 20' }, shopA);
    await expect(images.remove(img.id, shopB.establishmentId)).rejects.toThrow(/autre boutique/);
    await expect(images.remove(img.id, shopA.establishmentId)).resolves.toEqual({ deleted: true });
    await expect(images.file(img.id)).rejects.toThrow(/introuvable/);
  });
});
