import sharp from 'sharp';

/** Format unique des photos du catalogue : carré à fond blanc, appareil centré avec une marge */
export const FULL_SIZE = 1000;
export const THUMB_SIZE = 320;
export const MIN_SOURCE_SIDE = 300;
const MAX_FULL_BYTES = 550 * 1024;
const MAX_THUMB_BYTES = 75 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif']);

export class ImageRejected extends Error {}

export interface NormalizedImage {
  /** Carré WebP de 1000 px au plus (≤ 550 Ko) : photo publiée */
  full: Buffer;
  /** 320 × 320 WebP (≤ 75 Ko) : vignette des cartes */
  thumb: Buffer;
  /** 512 px JPEG : envoyée à l'IA pour la vérification (léger) */
  review: Buffer;
  sourceWidth: number;
  sourceHeight: number;
}

async function encodeWebp(img: sharp.Sharp, maxBytes: number, qualities: number[]) {
  for (const quality of qualities) {
    const out = await img.clone().webp({ quality, effort: 4 }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  throw new ImageRejected('Photo trop lourde même compressée');
}

export async function normalizeProductImage(input: Buffer): Promise<NormalizedImage> {
  // Jamais de SVG / HTML (contenu actif) : seuls les vrais formats d'image sont décodés
  const head = input.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<')) throw new ImageRejected('Pas une image (SVG / HTML)');
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { animated: false, limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageRejected('Image illisible');
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageRejected(`Format refusé (${meta.format || 'inconnu'})`);
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (Math.min(w, h) < MIN_SOURCE_SIDE) throw new ImageRejected(`Trop petite (${w}×${h})`);

  // Fond blanc, bords uniformes retirés, appareil réduit dans 88 % du carré (sans agrandir une petite image)
  let base = sharp(input, { animated: false, limitInputPixels: 50_000_000 }).rotate().flatten({ background: '#ffffff' });
  try {
    const trimmed = await base.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    if (trimmed.info.width >= MIN_SOURCE_SIDE / 2 && trimmed.info.height >= MIN_SOURCE_SIDE / 2) base = sharp(trimmed.data);
  } catch {
    /* image uniforme : on garde l'originale */
  }
  const inner = Math.round(FULL_SIZE * 0.88);
  const fitted = await base.resize(inner, inner, { fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const side = Math.min(FULL_SIZE, Math.round(Math.max(fitted.info.width, fitted.info.height) / 0.88));
  const padX = Math.max(0, side - fitted.info.width);
  const padY = Math.max(0, side - fitted.info.height);
  const square = await sharp(fitted.data)
    .extend({ left: Math.floor(padX / 2), right: Math.ceil(padX / 2), top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2), background: '#ffffff' })
    .toBuffer(); // jamais agrandie : une petite photo reste nette (côté entre ~340 et 1000 px)

  const img = sharp(square);
  const full = await encodeWebp(img, MAX_FULL_BYTES, [82, 72, 60]);
  const thumb = await encodeWebp(sharp(square).resize(THUMB_SIZE, THUMB_SIZE), MAX_THUMB_BYTES, [74, 62, 50]);
  const review = await sharp(square).resize(512, 512).jpeg({ quality: 78 }).toBuffer();
  return { full, thumb, review, sourceWidth: w, sourceHeight: h };
}
