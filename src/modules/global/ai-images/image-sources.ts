/**
 * Repérage des photos produit dans une page web (page officielle du fabricant, fiche revendeur…).
 * Fonctions pures : testables sans réseau.
 */

const IMG_EXT = /\.(jpe?g|png|webp|avif)(?:$|[?#])/i;
const NOISE = /(logo|icon|sprite|favicon|banner|badge|avatar|placeholder|loading|pixel|tracking|thumb[_-]?\d{2}x|\b1x1\b|flag|payment|social)/i;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#39;/g, "'")
    .trim();

/** Mots du modèle qui doivent idéalement apparaître dans l'adresse de la photo (« galaxy », « a55 »…) */
export const modelTokens = (brand: string, model: string) =>
  [...new Set(`${brand} ${model}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 2))];

const absolute = (raw: string, base: string) => {
  try {
    const u = new URL(decode(raw), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Plus grande image d'un attribut srcset (« a.jpg 480w, b.jpg 1200w ») */
const largestFromSrcset = (srcset: string) => {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    const w = Number((size || '').replace(/[wx]$/, '')) || 1;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url || null;
};

export function extractImageUrls(html: string, baseUrl: string, tokens: string[], max = 6): string[] {
  const found = new Map<string, number>();
  const add = (raw: string | null | undefined, bonus: number) => {
    if (!raw || raw.startsWith('data:')) return;
    const url = absolute(raw, baseUrl);
    if (!url || /\.svg(?:$|[?#])/i.test(url) || NOISE.test(url)) return;
    const lower = url.toLowerCase();
    const hits = tokens.filter((t) => lower.includes(t)).length;
    const score = bonus + hits * 3 + (IMG_EXT.test(url) ? 1 : 0);
    found.set(url, Math.max(found.get(url) ?? 0, score));
  };

  // Images déclarées pour le partage : souvent la photo principale du produit
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)) {
    add(m[0].match(/content=["']([^"']+)["']/i)?.[1], 6);
  }
  // Données structurées produit (JSON-LD « image »)
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
    for (const u of m[1].matchAll(/"(https?:[^"]+)"/g)) add(u[1].replace(/\\\//g, '/'), 5);
  }
  // Balises <img> (src, data-src, srcset : la plus grande version)
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\b(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    add(srcset ? largestFromSrcset(decode(srcset)) : null, 1);
    add(tag.match(/\bdata-(?:src|zoom-image|large|original)=["']([^"']+)["']/i)?.[1], 1);
    add(tag.match(/\bsrc=["']([^"']+)["']/i)?.[1], 0);
  }
  return [...found.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([u]) => u);
}

/** Domaine affiché à l'admin (« samsung.com ») */
export const domainOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

export interface FreeImage {
  url: string;
  page: string | null;
  /** Auteur et licence, à citer (« Photo : X, CC BY-SA 4.0, Wikimedia Commons ») */
  credit: string | null;
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Adresse de recherche Wikimedia Commons (gratuit, sans clé) : photos du modèle, ≥ 600 px */
export const commonsSearchUrl = (brand: string, model: string) =>
  'https://commons.wikimedia.org/w/api.php?' +
  new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '15',
    gsrsearch: `filetype:bitmap ${brand} ${(model.toLowerCase().startsWith(brand.toLowerCase()) ? model.slice(brand.length) : model).trim()}`,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    // Taille de vignette standard de Wikimedia (les tailles libres sont refusées / limitées)
    iiurlwidth: '1280',
  }).toString();

/** Lecture de la réponse Commons : seules les photos dont le titre cite le modèle sont gardées */
export function parseCommons(json: any, tokens: string[], max = 8, checkTitle = true): FreeImage[] {
  const pages: any[] = Object.values(json?.query?.pages || {});
  const out: Array<FreeImage & { hits: number }> = [];
  const modelTokens = tokens.filter((t) => /\d/.test(t) || t.length >= 4);
  // Repères du modèle (« a55 », « 15 ») : tous doivent figurer dans le titre ; « 5g » seul n'en est pas un
  const markers = modelTokens.filter((t) => /\d/.test(t) && (t.length >= 3 || /^\d+$/.test(t)));
  for (const p of pages) {
    const info = p?.imageinfo?.[0];
    if (!info || Math.max(info.width || 0, info.height || 0) < 600) continue;
    const title = String(p.title || '').toLowerCase();
    const hits = checkTitle ? modelTokens.filter((t) => title.includes(t)).length : 1;
    if (checkTitle && (!hits || !markers.every((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(title)))) continue;
    const meta = info.extmetadata || {};
    const license = stripTags(String(meta.LicenseShortName?.value || ''));
    const artist = stripTags(String(meta.Artist?.value || ''));
    out.push({
      url: String(info.thumburl || info.url),
      page: info.descriptionurl ? String(info.descriptionurl) : null,
      credit: [artist && `Photo : ${artist}`, license, 'Wikimedia Commons'].filter(Boolean).join(', ') || null,
      hits,
    });
  }
  return out.sort((a, b) => b.hits - a.hits).slice(0, max).map(({ hits: _h, ...x }) => x);
}

// ─── Wikidata : photo de référence (propriété P18) de la fiche du modèle — gratuit, sans clé ───

/** Le libellé cite-t-il bien ce modèle (tous les repères chiffrés : « a55 », « 15 », « ultra 3 »…) ? */
export function labelMatches(label: string, tokens: string[]) {
  const l = label.toLowerCase();
  const strong = tokens.filter((t) => /\d/.test(t) || t.length >= 4);
  const markers = strong.filter((t) => /\d/.test(t) && (t.length >= 3 || /^\d+$/.test(t)));
  const hits = strong.filter((t) => l.includes(t)).length;
  return hits > 0 && markers.every((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(l));
}

export const wikidataSearchUrl = (brand: string, model: string) =>
  'https://www.wikidata.org/w/api.php?' +
  new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    language: 'en',
    type: 'item',
    limit: '6',
    search: `${brand} ${(model.toLowerCase().startsWith(brand.toLowerCase()) ? model.slice(brand.length) : model).trim()}`,
  }).toString();

/** Entités dont le libellé correspond au modèle */
export function parseWikidataSearch(json: any, tokens: string[]): string[] {
  return (json?.search || [])
    .filter((r: any) => labelMatches(`${r?.label || ''} ${r?.match?.text || ''}`, tokens))
    .map((r: any) => String(r.id))
    .filter((id: string) => /^Q\d+$/.test(id))
    .slice(0, 4);
}

export const wikidataEntitiesUrl = (ids: string[]) =>
  'https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: ids.join('|'), props: 'claims' }).toString();

/** Fichiers Commons des photos de référence (P18) */
export function parseWikidataImages(json: any): string[] {
  const files: string[] = [];
  for (const e of Object.values<any>(json?.entities || {})) {
    for (const c of e?.claims?.P18 || []) {
      const f = c?.mainsnak?.datavalue?.value;
      if (typeof f === 'string' && f.length < 250) files.push(f);
    }
  }
  return [...new Set(files)].slice(0, 6);
}

export const commonsFilesUrl = (files: string[]) =>
  'https://commons.wikimedia.org/w/api.php?' +
  new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: files.map((f) => `File:${f}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1280',
  }).toString();

/** Photos des fichiers demandés (le modèle est déjà vérifié par Wikidata : pas de contrôle du titre) */
export function parseCommonsFiles(json: any): FreeImage[] {
  return parseCommons(json, ['__toujours__'], 6, false);
}
