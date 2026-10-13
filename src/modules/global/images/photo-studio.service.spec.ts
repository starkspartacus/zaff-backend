import sharp from 'sharp';
import { PhotoStudioService, cropFromBox } from './photo-studio.service';
import type { AiClient, AiRequest } from '../ai-images/gemini.client';

/** Photo de test : un « appareil » sombre posé sur un fond (gris = photo en boutique, blanc = studio) */
const photo = (bg: string, opts: { w?: number; h?: number; box?: [number, number, number, number]; blur?: number; dark?: boolean } = {}) => {
  const w = opts.w ?? 1600;
  const h = opts.h ?? 1200;
  const [x, y, bw, bh] = opts.box ?? [900, 300, 400, 700];
  let img = sharp({ create: { width: w, height: h, channels: 3, background: bg } }).composite([
    { input: { create: { width: bw, height: bh, channels: 3, background: '#1d3557' } }, left: x, top: y },
    { input: { create: { width: Math.round(bw * 0.8), height: Math.round(bh * 0.7), channels: 3, background: '#e63946' } }, left: x + Math.round(bw * 0.1), top: y + Math.round(bh * 0.1) },
  ]);
  return (async () => {
    let buf = await img.jpeg({ quality: 92 }).toBuffer();
    if (opts.blur) buf = await sharp(buf).blur(opts.blur).jpeg().toBuffer();
    if (opts.dark) buf = await sharp(buf).modulate({ brightness: 0.3 }).jpeg().toBuffer();
    return buf;
  })();
};

class FakeAi implements AiClient {
  enabled = true;
  model = 'test';
  calls: AiRequest[] = [];
  answer: unknown = null;
  hang = false;
  async generate(req: AiRequest) {
    this.calls.push(req);
    if (this.hang) return new Promise<never>(() => undefined);
    return { text: JSON.stringify(this.answer), sources: [] };
  }
}

describe('Studio photo des boutiques : recadrage, lumière, format avant UploadThing', () => {
  let ai: FakeAi;
  let studio: PhotoStudioService;
  beforeEach(() => {
    ai = new FakeAi();
    studio = new PhotoStudioService(ai);
  });

  it('cadre de l\'IA : marge ajoutée, cadres absurdes ignorés', () => {
    expect(cropFromBox([250, 562, 833, 812], 1600, 1200)).toEqual({ left: 875, top: 258, width: 449, height: 784 });
    expect(cropFromBox([0, 0, 1000, 1000], 1600, 1200)).toBeNull(); // déjà plein cadre
    expect(cropFromBox([500, 500, 510, 510], 1600, 1200)).toBeNull(); // minuscule
    expect(cropFromBox([800, 100, 200, 900], 1600, 1200)).toBeNull(); // inversé
    expect(cropFromBox(undefined, 1600, 1200)).toBeNull();
  });

  it('photo en boutique : recadrée par l\'IA sur l\'appareil, carré WebP sur fond assorti + vignette', async () => {
    ai.answer = { found: true, box: [250, 562, 833, 812], matches: true, device: 'Smartphone bleu', issues: ['hand'] };
    const r = await studio.enhance(await photo('#8d8d8d'), { brand: 'Samsung', model: 'Galaxy A55' }, 'shopA');
    expect(ai.calls[0].parts.some((p) => 'image' in p)).toBe(true);
    expect(r.ai).toEqual({ used: true, cropped: true, matches: true, device: 'Smartphone bleu' });
    expect(r.steps).toContain("Recadrée sur l'appareil par l'IA");
    expect(r.background).toBe('tinted');
    expect(r.tips.some((t) => /main tient/.test(t))).toBe(true);
    const full = await sharp(r.full).metadata();
    const thumb = await sharp(r.thumb).metadata();
    expect([full.format, full.width === full.height, full.width! <= 1000, r.full.length <= 550 * 1024]).toEqual(['webp', true, true, true]);
    expect([thumb.format, thumb.width]).toEqual(['webp', 320]);
    // L'appareil remplit maintenant l'essentiel du carré (avant : 8 % de la photo)
    const { data, info } = await sharp(r.full).resize(100, 100).raw().toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 150 && data[i + 1] < 110) red++;
    expect(red / (100 * 100)).toBeGreaterThan(0.15); // photo d'origine : 8 %
  });

  it('sans IA (non configurée ou quota) : bords uniformes retirés, fond blanc gardé', async () => {
    const r = await new PhotoStudioService(undefined).enhance(await photo('#ffffff'), {}, 'shopA');
    expect(r.ai.used).toBe(false);
    expect(r.steps).toContain('Bords inutiles retirés');
    expect(r.background).toBe('white');
  });

  it('IA trop lente : on continue sans elle ; IA qui pense voir un autre modèle : conseil', async () => {
    ai.hang = true;
    studio.aiTimeoutMs = 50;
    const slow = await studio.enhance(await photo('#ffffff'), {}, 'shopA');
    expect([slow.ai.used, slow.ai.cropped]).toEqual([false, false]);
    ai.hang = false;
    ai.answer = { found: true, box: [0, 0, 1000, 1000], matches: false, device: 'iPhone 13' };
    const other = await studio.enhance(await photo('#8d8d8d'), { brand: 'Samsung', model: 'Galaxy A55' }, 'shopA');
    expect(other.tips.some((t) => /iPhone 13/.test(t))).toBe(true);
  });

  it('photo sombre éclaircie, photo floue signalée', async () => {
    ai.enabled = false;
    const dark = await studio.enhance(await photo('#8d8d8d', { dark: true }), {}, 'shopA');
    expect(dark.steps).toContain('Photo sombre éclaircie');
    const blurry = await studio.enhance(await photo('#8d8d8d', { blur: 12 }), {}, 'shopA');
    expect(blurry.tips.some((t) => /floue/.test(t))).toBe(true);
    const sharpOne = await studio.enhance(await photo('#8d8d8d'), {}, 'shopA');
    expect(sharpOne.tips.some((t) => /floue/.test(t))).toBe(false);
  });

  it('quota par boutique : au-delà de 30 photos par heure, recadrage sans IA ; autres boutiques non touchées', async () => {
    ai.answer = { found: true, box: [250, 562, 833, 812], matches: true };
    const img = await photo('#8d8d8d', { w: 640, h: 480, box: [360, 120, 160, 280] });
    for (let i = 0; i < 30; i++) await studio.enhance(img, {}, 'busy');
    expect((await studio.enhance(img, {}, 'busy')).ai.used).toBe(false);
    expect((await studio.enhance(img, {}, 'other')).ai.used).toBe(true);
  }, 60_000);

  it('refuse ce qui n\'est pas une photo, et les photos trop petites', async () => {
    await expect(studio.enhance(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toThrow(/pas une photo/);
    const tiny = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#888' } }).jpeg().toBuffer();
    await expect(studio.enhance(tiny)).rejects.toThrow(/trop petite/);
  });
});
