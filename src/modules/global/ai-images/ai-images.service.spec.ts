import sharp from 'sharp';
import { FakeModel } from '../../../testing/fake-model';
import { ImagesService } from '../images/images.service';
import { DevicesService } from '../devices/devices.service';
import { AiImagesService, Fetcher } from './ai-images.service';
import { AiClient, AiQuotaExceeded, AiRequest, AiUnavailable, parseJsonLoose } from './gemini.client';
import { normalizeProductImage, ImageRejected } from './image-normalize';
import { commonsSearchUrl, extractImageUrls, modelTokens, parseCommons } from './image-sources';
import { isPublicAddress, safeFetch } from './safe-fetch';

const photo = (color: string, w = 1600, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: Math.round(w / 3), height: Math.round(h * 0.8), channels: 3, background: color } }, gravity: 'center' }])
    .png()
    .toBuffer();

class FakeAi implements AiClient {
  enabled = true;
  model = 'gemini-test';
  calls: AiRequest[] = [];
  verdicts: any[] = [];
  failWith: Error | null = null;
  searchQuota: Date | null = null;
  reviewQuota: Date | null = null;
  facts: any[] = [];
  async generate(req: AiRequest) {
    const text = req.parts.map((p) => ('text' in p ? p.text : '')).join(' ');
    if (text.includes('Devices:')) {
      if (this.reviewQuota) throw new AiQuotaExceeded('quota', this.reviewQuota);
      this.calls.push(req);
      return { text: JSON.stringify({ devices: this.facts }), sources: [] };
    }
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    if (req.search && this.searchQuota) throw new AiQuotaExceeded('quota', this.searchQuota);
    if (!req.search && this.reviewQuota) throw new AiQuotaExceeded('quota', this.reviewQuota);
    if (req.search) {
      return {
        text: 'Voici :\n```json\n{"images":[{"url":"https://cdn.samsung.com/a55-noir.png","page":"https://www.samsung.com/a55","color":"Noir"}],"pages":["https://www.samsung.com/a55"]}\n```',
        sources: [{ uri: 'https://shop.example.com/galaxy-a55' }],
      };
    }
    return { text: JSON.stringify({ images: this.verdicts }), sources: [] };
  }
}

describe('Photos des appareils trouvées par l\'IA', () => {
  let ai: FakeAi;
  let service: AiImagesService;
  let devices: DevicesService;
  let imageModel: FakeModel;
  let candidates: FakeModel;
  let jobs: FakeModel;
  const fetched: string[] = [];
  let files: Record<string, Buffer>;

  const fetcher: Fetcher = async (url) => {
    fetched.push(url);
    if (url === 'https://www.samsung.com/a55') {
      const html = `<html><head><meta property="og:image" content="https://cdn.samsung.com/a55-bleu.png"></head>
        <body><img src="/img/logo.png"><img src="https://cdn.samsung.com/galaxy-a55-violet.png"><img src="https://cdn.samsung.com/a55-mini.png"></body></html>`;
      return { buffer: Buffer.from(html), contentType: 'text/html; charset=utf-8', url };
    }
    if (url === 'https://shop.example.com/galaxy-a55') return { buffer: Buffer.from('<img data-src="https://shop.example.com/a55.svg">'), contentType: 'text/html', url };
    if (url.startsWith('https://commons.wikimedia.org/w/api.php')) {
      const page = (title: string, file: string, w = 1600) => ({ title, imageinfo: [{ thumburl: file, descriptionurl: 'https://commons.wikimedia.org/wiki/' + title, width: w, height: 900, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="#">Jean Photo</a>' } } }] });
      return {
        buffer: Buffer.from(JSON.stringify({ query: { pages: { 1: page('File:Samsung Galaxy A55 noir.jpg', 'https://cdn.samsung.com/a55-noir.png'), 2: page('File:Samsung Galaxy A54.jpg', 'https://upload.example.org/a54.png'), 3: page('File:Galaxy A55 mini.jpg', 'https://x/y.png', 300) } } })),
        contentType: 'application/json',
        url,
      };
    }
    if (files[url]) return { buffer: files[url], contentType: 'image/png', url };
    throw new Error('HTTP 404');
  };

  beforeAll(async () => {
    files = {
      'https://cdn.samsung.com/a55-noir.png': await photo('#111111'),
      'https://cdn.samsung.com/a55-bleu.png': await photo('#9fc5e8'),
      'https://cdn.samsung.com/galaxy-a55-violet.png': await photo('#b4a7d6'),
      'https://cdn.samsung.com/a55-mini.png': await photo('#ff0000', 120, 80), // trop petite
    };
  });

  beforeEach(async () => {
    fetched.length = 0;
    ai = new FakeAi();
    imageModel = new FakeModel(['sha256']);
    candidates = new FakeModel();
    jobs = new FakeModel();
    devices = new DevicesService(new FakeModel() as any, new ImagesService(imageModel as any));
    await devices.onModuleInit();
    service = new AiImagesService(jobs as any, candidates as any, devices, ai, fetcher);
  });

  const a55 = async () => {
    const d = (await devices.list({ search: 'galaxy a55' })).items[0];
    return devices.update(d.id, { colors: ['Noir', 'Bleu glacé', 'Lilas'] });
  };

  it('recherche, mise au format, vérification par l\'IA : la meilleure photo par coloris est proposée à l\'admin', async () => {
    const dev = await a55();
    ai.verdicts = [
      { index: 0, sameModel: true, productPhoto: true, view: 'front', color: 'Noir', cleanBackground: true, textOrWatermark: false, score: 94, reason: 'Vue de face officielle' },
      { index: 1, sameModel: true, productPhoto: true, view: 'front', color: 'bleu glace', cleanBackground: true, textOrWatermark: true, score: 85, reason: 'Logo du site en bas' },
      { index: 2, sameModel: false, productPhoto: true, view: 'front', color: null, cleanBackground: true, textOrWatermark: false, score: 90, reason: 'Galaxy A54' },
    ];
    const job = await service.createJob({ deviceIds: [dev.id] });
    await service.kick();

    // Pages visitées, logo / SVG / image trop petite écartés, 3 photos envoyées à l'IA
    expect(fetched).toEqual(expect.arrayContaining(['https://www.samsung.com/a55', 'https://shop.example.com/galaxy-a55']));
    expect(fetched.some((u) => u.includes('logo') || u.endsWith('.svg'))).toBe(false);
    const review = ai.calls[1];
    expect(review.schema).toBeTruthy();
    expect(review.parts.filter((p) => 'image' in p)).toHaveLength(3);

    const list = await service.listCandidates({ jobId: job.id });
    expect(list.map((c) => [c.color, c.score])).toEqual([['Noir', 94], ['Bleu glacé', 60]]); // texte : −25
    expect(list[0]).toMatchObject({ source: 'samsung.com', status: 'pending', device: { brand: 'Samsung', model: 'Galaxy A55 5G', photos: 0 } });
    const [j] = await service.listJobs();
    expect(j).toMatchObject({ status: 'done', processed: 1, found: 2, published: 0 });

    // Format ZAFF : carré WebP ≤ 1000 px + vignette 320 px
    const full = await sharp(await service.preview(list[0].id, 'full')).metadata();
    const thumb = await sharp(await service.preview(list[0].id, 'thumb')).metadata();
    expect([full.format, full.width === full.height, full.width! <= 1000]).toEqual(['webp', true, true]);
    expect([thumb.format, thumb.width]).toEqual(['webp', 320]);

    // Publication : photo ajoutée à l'appareil (coloris compris), fichiers temporaires effacés
    await service.publish(list[0].id);
    const d = await devices.get(dev.id);
    expect(d.photos).toEqual([{ imageId: expect.any(String), color: 'Noir' }]);
    expect(candidates.docs.find((c) => String(c._id) === list[0].id)).toMatchObject({ status: 'published', full: null, thumb: null });
    await expect(service.publish(list[0].id)).rejects.toThrow(/déjà été traitée/);

    // Validation en masse du reste du lot
    expect(await service.publishMany({ jobId: job.id, minScore: 50 })).toEqual({ published: 1, failed: 0 });
    expect((await devices.get(dev.id)).photos).toHaveLength(2);
    // Relancer la sélection automatique : l'A55 a maintenant des photos, il n'est plus proposé en tête
    const next = await service.createJob({ selection: 'missing-popular', limit: 5 });
    expect(next.total).toBe(5);
  });

  it('publication automatique au-dessus de la note choisie ; le reste attend la validation', async () => {
    const dev = await a55();
    ai.verdicts = [
      { index: 0, sameModel: true, productPhoto: true, view: 'front', color: 'Noir', cleanBackground: true, textOrWatermark: false, score: 96, reason: 'Parfait' },
      { index: 1, sameModel: true, productPhoto: true, view: 'angle', color: 'Bleu glacé', cleanBackground: true, textOrWatermark: false, score: 82, reason: 'Vue de trois quarts' },
    ];
    await service.createJob({ deviceIds: [dev.id], auto: true, minScore: 90 });
    await service.kick();
    expect((await devices.get(dev.id)).photos).toHaveLength(1);
    expect((await service.listCandidates({})).map((c) => c.score)).toEqual([82]);
    const [j] = await service.listJobs();
    expect(j).toMatchObject({ found: 2, published: 1 });
  });

  it('clé refusée / quota épuisé : le lot s\'arrête avec la raison ; rejet d\'une photo', async () => {
    const dev = await a55();
    ai.failWith = new AiUnavailable('Gemini refuse la requête : API key not valid');
    await service.createJob({ deviceIds: [dev.id, (await devices.list({ search: 'iphone 15' })).items[0].id] });
    await service.kick();
    const [j] = await service.listJobs();
    expect(j).toMatchObject({ status: 'failed', errors: 1, lastError: expect.stringMatching(/API key/) });
    ai.enabled = false;
    await expect(service.createJob({ deviceIds: [dev.id] })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('mise au format : petites images, SVG et fichiers illisibles refusés', async () => {
    await expect(normalizeProductImage(await photo('#000', 200, 150))).rejects.toBeInstanceOf(ImageRejected);
    await expect(normalizeProductImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).rejects.toBeInstanceOf(ImageRejected);
    await expect(normalizeProductImage(Buffer.from('pas une image'))).rejects.toBeInstanceOf(ImageRejected);
    const n = await normalizeProductImage(await photo('#333', 3000, 2000));
    expect(n.full.length).toBeLessThan(550 * 1024);
    expect((await sharp(n.full).metadata()).width).toBe(1000);
  });

  it('repérage des photos dans une page et lecture du JSON de l\'IA', () => {
    const html = `<meta property="og:image" content="https://x.com/p/galaxy-a55-front.jpg?w=1200">
      <script type="application/ld+json">{"image":["https:\\/\\/x.com\\/media\\/a55-back.webp"]}</script>
      <img srcset="https://x.com/a55-480.jpg 480w, https://x.com/a55-1200.jpg 1200w"><img src="https://x.com/icons/cart.png"><img src="data:image/png;base64,AAAA">`;
    const urls = extractImageUrls(html, 'https://x.com/a55', modelTokens('Samsung', 'Galaxy A55 5G'));
    expect(urls[0]).toBe('https://x.com/p/galaxy-a55-front.jpg?w=1200');
    expect(urls).toEqual(expect.arrayContaining(['https://x.com/media/a55-back.webp', 'https://x.com/a55-1200.jpg']));
    expect(urls.some((u) => u.includes('icons') || u.includes('480'))).toBe(false);
    expect(parseJsonLoose('blabla ```json\n{"a":1}\n``` fin')).toEqual({ a: 1 });
    expect(parseJsonLoose('Réponse : {"images":[]} merci')).toEqual({ images: [] });
    expect(parseJsonLoose('rien')).toBeNull();
  });

  it('téléchargement : adresses internes refusées (serveur, réseau local, métadonnées cloud)', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
    }
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true);
    await expect(safeFetch('http://127.0.0.1:8000/api', { maxBytes: 1000 })).rejects.toThrow(/non publique/);
    await expect(safeFetch('http://169.254.169.254/latest/meta-data', { maxBytes: 1000 })).rejects.toThrow(/non publique/);
    await expect(safeFetch('file:///etc/passwd', { maxBytes: 1000 })).rejects.toThrow(/Protocole/);
    await expect(safeFetch('http://localhost:8000/', { maxBytes: 1000 })).rejects.toThrow(/non publique/);
  });

  it('quota gratuit épuisé pour la recherche : photos libres de Wikimedia Commons, avec le crédit de l\'auteur', async () => {
    const dev = await a55();
    ai.searchQuota = new Date(Date.now() + 3600_000);
    ai.verdicts = [{ index: 0, sameModel: true, productPhoto: true, view: 'front', color: 'Noir', cleanBackground: true, textOrWatermark: false, score: 88, reason: 'Photo de face' }];
    await service.createJob({ deviceIds: [dev.id] });
    await service.kick();
    const [c] = await service.listCandidates({});
    expect(c).toMatchObject({ score: 88, source: 'commons.wikimedia.org', verdict: { credit: 'Photo : Jean Photo, CC BY-SA 4.0, Wikimedia Commons' } });
    expect(fetched.some((u) => u.includes('a54'))).toBe(false); // autre modèle écarté par le titre
  });

  it('quota épuisé pour la vérification : le lot se met en pause puis reprend tout seul là où il en était', async () => {
    const dev = await a55();
    ai.reviewQuota = new Date(Date.now() + 3600_000);
    ai.verdicts = [{ index: 0, sameModel: true, productPhoto: true, view: 'front', color: 'Noir', cleanBackground: true, textOrWatermark: false, score: 91, reason: 'OK' }];
    const job = await service.createJob({ deviceIds: [dev.id] });
    await service.kick();
    let [j] = await service.listJobs();
    expect(j).toMatchObject({ status: 'paused', processed: 0, errors: 0, resumeAt: ai.reviewQuota, lastError: expect.stringMatching(/reprise automatique/) });
    expect(await service.listCandidates({})).toHaveLength(0);
    // L'heure de reprise est passée et le quota revenu
    ai.reviewQuota = null;
    jobs.docs.find((d) => String(d._id) === job.id).resumeAt = new Date(Date.now() - 1000);
    await service.kick();
    [j] = await service.listJobs();
    expect(j).toMatchObject({ status: 'done', processed: 1, found: expect.any(Number) });
    expect((await service.listCandidates({})).length).toBeGreaterThan(0);
  });

  it('Commons : seuls les fichiers dont le titre cite exactement le modèle', () => {
    expect(commonsSearchUrl('Samsung', 'Samsung Galaxy A55 5G')).toContain('gsrsearch=filetype%3Abitmap+Samsung+Galaxy+A55+5G');
    const json = { query: { pages: {
      a: { title: 'File:Samsung Galaxy A55.jpg', imageinfo: [{ url: 'u1', width: 2000, height: 1500, extmetadata: {} }] },
      b: { title: 'File:Samsung Galaxy A550.jpg', imageinfo: [{ url: 'u2', width: 2000, height: 1500, extmetadata: {} }] },
      c: { title: 'File:Galaxy A55 tiny.jpg', imageinfo: [{ url: 'u3', width: 200, height: 150, extmetadata: {} }] },
    } } };
    expect(parseCommons(json, modelTokens('Samsung', 'Galaxy A55 5G')).map((x) => x.url)).toEqual(['u1']);
  });

  it('fiches complétées par l\'IA : seulement ce qui est vide, codes couleur ajoutés, rien d\'inventé', async () => {
    const a = (await devices.list({ search: 'galaxy a55' })).items[0];
    const b = await devices.update((await devices.list({ search: 'iphone 15 pro max' })).items[0].id, { colors: ['Titane noir'], specs: [{ label: 'Écran', value: 'Saisie admin' }] });
    const c = await devices.create({ category: 'smartphones', brand: 'Inconnue', model: 'Zz 1' });
    ai.facts = [
      { id: a.id, known: true, colors: [{ name: 'Bleu glacé', hex: '#A9C8E8' }, { name: 'Noir', hex: '#1c1c1e' }, { name: 'Lilas', hex: 'violet' }], variants: ['8 Go + 128 Go', '8 Go + 256 Go'], specs: [{ label: 'Écran', value: '6,6" Super AMOLED 120 Hz' }] },
      { id: b.id, known: true, colors: [{ name: 'Titane noir', hex: '#3b3b3d' }, { name: 'Titane bleu', hex: '#2f3a4c' }], variants: ['256 Go'], specs: [{ label: 'Écran', value: 'IA' }] },
      { id: c.id, known: false },
    ];
    const job = await service.createJob({ kind: 'specs', deviceIds: [a.id, b.id, c.id] });
    await service.kick();
    expect(ai.calls.filter((r) => !r.search)).toHaveLength(1); // les 3 fiches en une seule requête
    const A = await devices.get(a.id);
    expect(A.colors).toEqual(['Bleu glacé', 'Noir', 'Lilas']);
    expect(A.colorCodes).toEqual([{ name: 'Bleu glacé', hex: '#a9c8e8' }, { name: 'Noir', hex: '#1c1c1e' }]); // « violet » n'est pas un code
    expect(A.variants).toEqual(['128 Go', '256 Go']); // déjà connues : gardées
    const B = await devices.get(b.id);
    expect(B.colors).toEqual(['Titane noir']); // saisie de l'admin gardée
    expect(B.specs).toEqual([{ label: 'Écran', value: 'Saisie admin' }]);
    expect(B.colorCodes).toEqual([{ name: 'Titane noir', hex: '#3b3b3d' }]);
    expect((await devices.get(c.id)).colors).toEqual([]);
    const [j] = await service.listJobs();
    expect(j).toMatchObject({ id: job.id, kind: 'specs', status: 'done', processed: 3, found: 2, notFound: 1 });
    expect(j.log.map((l: any) => l.detail)).toEqual(expect.arrayContaining([expect.stringMatching(/rien n'a été inventé/), expect.stringMatching(/Complété : coloris, codes couleur, fiche technique/)]));
    // Sélection automatique : seulement les fiches encore incomplètes
    const next = await service.createJob({ kind: 'specs', selection: 'incomplete', limit: 500 });
    expect(next.total).toBeGreaterThan(100);
  });

  it('journal par appareil : on sait pourquoi aucune photo n\'a été trouvée', async () => {
    const dev = await a55();
    files = {}; // sites des fabricants et Wikimedia : toutes les photos refusées (404)
    ai.verdicts = [];
    await service.createJob({ deviceIds: [dev.id] });
    await service.kick();
    const [j] = await service.listJobs();
    expect(j).toMatchObject({ notFound: 1 });
    expect(j.log[0]).toMatchObject({ name: 'Samsung Galaxy A55 5G', result: 'none', detail: expect.stringMatching(/Recherche IA : \d+ photo\(s\) repérée\(s\).*HTTP 404.*Wikimedia/) });
  });
});
