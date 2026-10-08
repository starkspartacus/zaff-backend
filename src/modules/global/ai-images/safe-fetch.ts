import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { isIP } from 'net';

/**
 * Téléchargement d'une ressource publique d'Internet (pages produit, photos trouvées par l'IA).
 * Protections : http(s) uniquement, adresses privées / locales refusées (vérifiées sur l'IP réellement contactée,
 * donc aussi après une redirection ou un changement DNS), 3 redirections max, taille et durée limitées.
 */

export class FetchRefused extends Error {}

const BLOCKED_V4: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (CGNAT)
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (métadonnées cloud)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 3], // multicast + réservé
];

const v4ToInt = (ip: string) => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = v4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (family === 6) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false; // fc00::/7
    if (/^fe[89ab]/.test(v)) return false; // fe80::/10
    if (v.startsWith('ff')) return false; // multicast
    return true;
  }
  return false;
}

/** Résolution DNS qui refuse les adresses non publiques (utilisée par la connexion elle-même) */
const safeLookup: typeof dns.lookup = ((hostname: string, options: any, callback: any) => {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options || {};
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses: any) => {
    if (err) return cb(err);
    const list: dns.LookupAddress[] = Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }];
    const ok = list.filter((a) => isPublicAddress(a.address));
    if (!ok.length) return cb(new FetchRefused(`Adresse non publique refusée (${hostname})`));
    if (opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}) as typeof dns.lookup;

export interface FetchResult {
  buffer: Buffer;
  contentType: string;
  url: string;
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
  maxRedirects?: number;
  /** Page d'où vient l'image (certains sites refusent une image demandée sans elle) */
  referer?: string | null;
}

/** Wikimedia exige un robot identifié (sinon 429) ; les autres sites reçoivent un navigateur classique */
const BOT_UA = 'ZAFF-catalogue/1.0 (https://github.com/starkspartacus/zaff-backend; photos produit du catalogue) node-https';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const userAgentFor = (host: string) => (/(^|\.)(wikimedia|wikipedia)\.org$/i.test(host) ? BOT_UA : BROWSER_UA);

export function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<FetchResult> {
  const { maxBytes, timeoutMs = 10_000, accept = '*/*', maxRedirects = 3 } = opts;
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return reject(new FetchRefused('Adresse invalide'));
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return reject(new FetchRefused('Protocole refusé'));
    if (url.username || url.password) return reject(new FetchRefused('Identifiants dans l\'adresse refusés'));
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
      return reject(new FetchRefused('Adresse non publique refusée'));
    }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: {
          'User-Agent': userAgentFor(url.hostname),
          Accept: accept,
          'Accept-Language': 'fr,en;q=0.8',
          ...(opts.referer && /^https?:\/\//.test(opts.referer) ? { Referer: opts.referer } : {}),
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (maxRedirects <= 0) return reject(new FetchRefused('Trop de redirections'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(safeFetch(next, { ...opts, maxRedirects: maxRedirects - 1 }));
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }
        const declared = Number(res.headers['content-length'] || 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new FetchRefused('Fichier trop lourd'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new FetchRefused('Fichier trop lourd'));
          } else chunks.push(c);
        });
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: String(res.headers['content-type'] || ''), url: url.toString() }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
  });
}
