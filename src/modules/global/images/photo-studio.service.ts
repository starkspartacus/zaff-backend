import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { AI_CLIENT, AiClient, parseJsonLoose } from '../ai-images/gemini.client';
import { ImageRejected } from '../ai-images/image-normalize';

/**
 * « Studio photo » des boutiques : la photo prise au téléphone est recadrée sur l'appareil (par l'IA quand elle est
 * disponible, sinon par l'analyse de l'image), redressée, éclaircie si besoin, puis mise au format du catalogue
 * (carré, fond propre, WebP léger + vignette) AVANT l'envoi chez UploadThing. Rien n'est stocké ici : la boutique voit
 * le résultat, puis l'envoie à l'enregistrement du produit.
 */

export const STUDIO_SIZE = 1000;
export const STUDIO_THUMB = 320;
const MAX_FULL_BYTES = 550 * 1024;
const MAX_THUMB_BYTES = 75 * 1024;
const MIN_SIDE = 300;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);
/** En dessous : photo floue (écart-type du laplacien, mesuré sur 512 px ; une photo nette dépasse 1,5) */
const BLUR_LIMIT = 0.6;
/** Appareil dans 86 % du carré : une marge régulière autour */
const FILL = 0.86;
/** Appels à l'IA par boutique et par heure (quota gratuit partagé) ; au-delà, recadrage sans IA */
const AI_PER_SHOP_HOUR = 30;


export interface StudioMeta {
  brand?: string;
  model?: string;
  color?: string;
}

export interface StudioResult {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** Ce qui a été fait, affiché à la boutique */
  steps: string[];
  /** Conseils pour une meilleure photo */
  tips: string[];
  ai: { used: boolean; cropped: boolean; matches: boolean | null; device: string | null };
  background: 'white' | 'tinted';
}

interface AiBox {
  found?: boolean;
  box?: number[];
  matches?: boolean;
  device?: string;
  issues?: string[];
}

const BOX_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN' },
    box: { type: 'ARRAY', items: { type: 'INTEGER' } },
    matches: { type: 'BOOLEAN' },
    device: { type: 'STRING' },
    issues: { type: 'ARRAY', items: { type: 'STRING', enum: ['hand', 'box', 'reflection', 'cluttered', 'cut_off', 'screen_photo', 'several_devices'] } },
  },
  required: ['found'],
};

const ISSUE_TIPS: Record<string, string> = {
  hand: "Une main tient l'appareil : posez-le sur une table pour la photo.",
  box: "L'appareil est dans sa boîte : sortez-le pour une plus belle photo.",
  reflection: "Reflets sur l'écran : inclinez légèrement l'appareil ou éloignez-vous de la lumière directe.",
  cluttered: 'Arrière-plan chargé : posez l\'appareil sur une surface claire et unie.',
  cut_off: "Une partie de l'appareil est coupée : reculez un peu.",
  screen_photo: "C'est une photo d'écran : photographiez l'appareil lui-même.",
  several_devices: "Plusieurs appareils sur la photo : photographiez-en un seul.",
};

@Injectable()
export class PhotoStudioService {
  private readonly logger = new Logger(PhotoStudioService.name);
  private readonly usage = new Map<string, number[]>();
  /** Au-delà, on continue sans l'IA (réglable dans les tests) */
  aiTimeoutMs = 10_000;

  constructor(@Optional() @Inject(AI_CLIENT) private readonly ai?: AiClient) {}

  /** L'IA peut-elle encore être utilisée pour cette boutique cette heure-ci ? */
  private allowAi(shop: string) {
    if (!this.ai?.enabled) return false;
    const now = Date.now();
    const recent = (this.usage.get(shop) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= AI_PER_SHOP_HOUR) return false;
    recent.push(now);
    this.usage.set(shop, recent);
    return true;
  }

  /** Cadre de l'appareil demandé à l'IA (coordonnées 0–1000), jamais bloquant : sans réponse en 10 s, on continue sans */
  private async locate(jpeg: Buffer, meta: StudioMeta): Promise<AiBox | null> {
    const expected = [meta.brand, meta.model, meta.color].filter(Boolean).join(' ') || 'an electronic device';
    const prompt = [
      'PHOTO STUDIO. A shop employee photographed a product to sell it. Expected product: "' + expected + '".',
      'Locate the main device. Reply JSON: found (a device is visible), box = [ymin, xmin, ymax, xmax] of the whole device',
      '(normalized 0-1000, tight but never cutting the device), matches (it looks like the expected product; true if unsure),',
      'device (what you see, short), issues among: hand, box, reflection, cluttered, cut_off, screen_photo, several_devices.',
    ].join('\n');
    const call = this.ai!.generate({ parts: [{ text: prompt }, { image: jpeg, mime: 'image/jpeg' }], schema: BOX_SCHEMA, temperature: 0 });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), this.aiTimeoutMs)));
    try {
      const res = await Promise.race([call, timeout]);
      if (!res) return null;
      return parseJsonLoose<AiBox>(res.text);
    } catch (e) {
      this.logger.debug(`Studio photo sans IA : ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
      call.catch(() => undefined);
    }
  }

  async enhance(input: Buffer, meta: StudioMeta = {}, shop = 'demo'): Promise<StudioResult> {
    const head = input.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<')) throw new ImageRejected('Ce fichier n\'est pas une photo.');
    let info: sharp.Metadata;
    try {
      info = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
    } catch {
      throw new ImageRejected('Photo illisible : essayez une photo JPEG ou PNG.');
    }
    if (!info.format || !ACCEPTED.has(info.format)) throw new ImageRejected('Format non pris en charge : envoyez une photo JPEG, PNG ou WebP.');

    const steps: string[] = [];
    const tips: string[] = [];
    // Photo redressée selon le capteur du téléphone (EXIF), fond blanc derrière la transparence, 1600 px au plus
    const work = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    let { width: W, height: H } = work.info;
    if (Math.min(W, H) < MIN_SIDE) throw new ImageRejected(`Photo trop petite (${W}×${H}) : prenez-la avec l'appareil photo du téléphone.`);
    let img = work.data;
    // Fond de la photo d'origine (avant recadrage) : blanc et uni = photo de studio
    const white = await hasWhiteBorder(img);
    // Lumière jugée sur toute la photo (la pièce), pas sur l'appareil : un appareil noir n'est pas « sombre »
    const scene = await sharp(img).resize(512, 512, { fit: 'inside' }).greyscale().stats();

    // 1. Recadrage sur l'appareil : IA si possible, sinon bords uniformes retirés
    const ai: StudioResult['ai'] = { used: false, cropped: false, matches: null, device: null };
    const found = this.allowAi(shop) ? await this.locate(await sharp(img).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer(), meta) : null;
    if (found) {
      ai.used = true;
      ai.matches = found.matches ?? null;
      ai.device = found.device?.slice(0, 80) || null;
      if (found.found === false) tips.push("L'IA ne voit pas d'appareil sur cette photo : vérifiez le cadrage.");
      if (found.matches === false && found.device) tips.push(`L'IA pense voir « ${found.device.slice(0, 60)} » : vérifiez que c'est le bon produit.`);
      for (const issue of found.issues || []) if (ISSUE_TIPS[issue] && !tips.includes(ISSUE_TIPS[issue])) tips.push(ISSUE_TIPS[issue]);
      const crop = found.found !== false ? cropFromBox(found.box, W, H) : null;
      if (crop) {
        img = await sharp(img).extract(crop).toBuffer();
        W = crop.width;
        H = crop.height;
        ai.cropped = true;
        steps.push("Recadrée sur l'appareil par l'IA");
      }
    }
    if (!ai.cropped) {
      try {
        const trimmed = await sharp(img).trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
        if (trimmed.info.width >= MIN_SIDE / 2 && trimmed.info.height >= MIN_SIDE / 2 && trimmed.info.width * trimmed.info.height < W * H * 0.97) {
          img = trimmed.data;
          W = trimmed.info.width;
          H = trimmed.info.height;
          steps.push('Bords inutiles retirés');
        }
      } catch {
        /* image uniforme : gardée telle quelle */
      }
    }

    // 2. Lumière et netteté : photo sombre éclaircie, contraste et couleurs ravivés légèrement
    const stats = await sharp(img).resize(512, 512, { fit: 'inside' }).greyscale().stats();
    const light = scene.channels[0].mean;
    let pipeline = sharp(img).normalise({ lower: 1, upper: 99 });
    if (light < 85) {
      pipeline = pipeline.modulate({ brightness: Math.min(1.25, 110 / Math.max(light, 40)), saturation: 1.05 });
      steps.push('Photo sombre éclaircie');
      if (light < 60) tips.push('Photo très sombre : prenez-la près d\'une fenêtre ou sous une bonne lumière.');
    } else {
      pipeline = pipeline.modulate({ saturation: 1.05 });
    }
    img = await pipeline.sharpen({ sigma: 0.8 }).toBuffer();
    steps.push('Lumière, contraste et netteté ajustés');
    if (stats.sharpness < BLUR_LIMIT) tips.push("Photo un peu floue : reprenez-la en tenant le téléphone immobile, à 30–40 cm de l'appareil.");

    // 3. Carré du catalogue : fond blanc si la photo l'est déjà, sinon fond flouté issu de la photo (pas de cadre blanc)
    const side = Math.min(STUDIO_SIZE, Math.max(MIN_SIDE, Math.round(Math.max(W, H) / FILL)));
    const inner = Math.round(side * FILL);
    const fitted = await sharp(img).resize(inner, inner, { fit: 'inside', withoutEnlargement: false }).toBuffer({ resolveWithObject: true });
    let layer = fitted.data;
    let background = '#ffffff';
    if (!white) {
      // Fond uni de la couleur du pourtour de la photo (éclaircie), photo aux bords fondus : aucun cadre visible
      background = await borderTint(img);
      const fw = fitted.info.width;
      const fh = fitted.info.height;
      const f = Math.max(8, Math.round(Math.min(fw, fh) * 0.06));
      const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}"><filter id="b"><feGaussianBlur stdDeviation="${f / 2}"/></filter>` +
          `<rect x="${f}" y="${f}" width="${fw - 2 * f}" height="${fh - 2 * f}" rx="${f}" fill="#fff" filter="url(#b)"/></svg>`,
      );
      layer = await sharp(fitted.data).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    }
    const square = await sharp({ create: { width: side, height: side, channels: 3, background } })
      .composite([{ input: layer, left: Math.round((side - fitted.info.width) / 2), top: Math.round((side - fitted.info.height) / 2) }])
      .jpeg({ quality: 95 })
      .toBuffer();
    steps.push(white ? 'Centrée sur fond blanc' : 'Centrée sur un fond assorti');

    const full = await encode(sharp(square), MAX_FULL_BYTES, [84, 74, 62]);
    const thumb = await encode(sharp(square).resize(STUDIO_THUMB, STUDIO_THUMB), MAX_THUMB_BYTES, [76, 64, 52]);
    return { full, thumb, width: side, height: side, steps, tips, ai, background: white ? 'white' : 'tinted' };
  }
}

/** Cadre de l'IA (0–1000) → zone à découper, avec une marge ; refusé s'il est absurde (trop petit, hors image) */
export function cropFromBox(box: number[] | undefined, W: number, H: number) {
  if (!Array.isArray(box) || box.length !== 4 || box.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = box.map((v) => Math.max(0, Math.min(1000, v)));
  if (y1 <= y0 || x1 <= x0) return null;
  const area = ((y1 - y0) * (x1 - x0)) / 1_000_000;
  // Appareil minuscule (erreur probable) ou déjà plein cadre (rien à recadrer)
  if (area < 0.03 || area > 0.92) return null;
  const mx = (x1 - x0) * 0.06;
  const my = (y1 - y0) * 0.06;
  const left = Math.max(0, Math.floor(((x0 - mx) / 1000) * W));
  const top = Math.max(0, Math.floor(((y0 - my) / 1000) * H));
  const right = Math.min(W, Math.ceil(((x1 + mx) / 1000) * W));
  const bottom = Math.min(H, Math.ceil(((y1 + my) / 1000) * H));
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_SIDE / 2 || height < MIN_SIDE / 2) return null;
  return { left, top, width, height };
}

/** Couleur moyenne du pourtour de la photo, mêlée de blanc : fond doux assorti à la photo */
async function borderTint(img: Buffer) {
  const { data, info } = await sharp(img).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x < 4 || y < 4 || x >= info.width - 4 || y >= info.height - 4) {
        const i = (y * info.width + x) * info.channels;
        for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        n++;
      }
    }
  }
  const hex = sum.map((v) => Math.round(v / n * 0.45 + 255 * 0.55).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

/** Le pourtour de la photo est-il blanc et uni (photo de studio) ? */
async function hasWhiteBorder(img: Buffer) {
  const { data, info } = await sharp(img).resize(64, 64, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const values: number[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x < 3 || y < 3 || x >= info.width - 3 || y >= info.height - 3) values.push(data[y * info.width + x]);
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return mean > 225 && sd < 18;
}

async function encode(img: sharp.Sharp, maxBytes: number, qualities: number[]) {
  for (const quality of qualities) {
    const out = await img.clone().webp({ quality, effort: 4 }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  throw new ImageRejected('Photo trop lourde même compressée.');
}
