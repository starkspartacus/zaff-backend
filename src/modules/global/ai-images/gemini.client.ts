import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_GEMINI_MODEL } from '../../../config/env.validation';

export type AiPart = { text: string } | { image: Buffer; mime: string };

export interface AiRequest {
  parts: AiPart[];
  /** Autorise le modèle à chercher sur Google (pages et photos officielles) */
  search?: boolean;
  /** Réponse JSON conforme à ce schéma (incompatible avec `search`) */
  schema?: Record<string, unknown>;
  temperature?: number;
}

export interface AiResponse {
  text: string;
  /** Pages consultées par la recherche Google */
  sources: { uri: string; title?: string }[];
}

/** Fournisseur d'IA (remplaçable dans les tests et la démo) */
export interface AiClient {
  readonly enabled: boolean;
  readonly model: string;
  generate(req: AiRequest): Promise<AiResponse>;
}

export const AI_CLIENT = 'AI_CLIENT';

export class AiUnavailable extends Error {}

/** Toutes les IA disponibles ont atteint leur quota (gratuit) : reprendre à `resumeAt` */
export class AiQuotaExceeded extends Error {
  constructor(
    message: string,
    readonly resumeAt: Date,
  ) {
    super(message);
  }
}

/** Limite atteinte pour un fournisseur précis (minute ou jour) */
class RateLimited extends Error {
  constructor(
    readonly retryMs: number,
    readonly daily: boolean,
    readonly detail = '',
  ) {
    super('quota');
  }
}

/** Modèle retiré par Google (avec le remplaçant conseillé s'il est indiqué) */
class ModelGone extends Error {
  constructor(
    message: string,
    readonly suggestion: string | null,
  ) {
    super(message);
  }
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAILY_COOLDOWN_MS = 60 * 60 * 1000; // quota du jour : nouvel essai toutes les heures
const MAX_WAIT_MS = 65_000;
const SEARCH_BLOCK_MS = 15 * 60 * 1000; // au-delà, le lot est mis en pause plutôt que d'attendre

/** Espace les appels pour rester sous la limite par minute (palier gratuit) */
class Spacer {
  private next = 0;
  constructor(private readonly rpm: number) {}
  async wait() {
    const gap = Math.ceil(60_000 / Math.max(1, this.rpm));
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + gap;
    if (at > now) await sleep(at - now);
  }
}

interface Provider {
  readonly name: string;
  readonly label: string;
  readonly search: boolean;
  call(req: AiRequest): Promise<AiResponse>;
}

/** Délai conseillé par Google (RetryInfo « 37s ») et type de quota (par minute / par jour) */
export function parseGoogleQuota(json: any): { retryMs: number; daily: boolean; detail: string } {
  const details: any[] = json?.error?.details || [];
  const message = String(json?.error?.message || '');
  const retry = details.find((d) => String(d?.['@type'] || '').includes('RetryInfo'))?.retryDelay;
  let secs = Number(String(retry || '').replace(/s$/, ''));
  if (!(secs > 0)) secs = Number(message.match(/retry in ([\d.]+)\s*s/i)?.[1] || 0);
  const quotaIds = details.flatMap((d) => (d?.violations || []).map((v: any) => String(v?.quotaId || '')));
  const daily = quotaIds.some((q) => /PerDay/i.test(q)) || /per[ _-]?day|daily/i.test(message);
  // « limit: 0 » : ce modèle (ou la recherche Google) n'a aucun quota gratuit pour cette clé
  const none = /limit:\s*0\b/.test(message);
  const detail = message.replace(/\s+/g, ' ').slice(0, 220);
  if (none) return { retryMs: 24 * 3600 * 1000, daily: true, detail };
  return { retryMs: daily ? DAILY_COOLDOWN_MS : secs > 0 ? secs * 1000 + 500 : 30_000, daily, detail };
}

class GeminiModel implements Provider {
  readonly search = true;
  private readonly spacer: Spacer;
  constructor(
    private readonly key: string,
    readonly name: string,
    rpm: number,
  ) {
    this.spacer = new Spacer(rpm);
  }
  get label() {
    return `Gemini ${this.name}`;
  }

  async call(req: AiRequest): Promise<AiResponse> {
    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: req.parts.map((p) => ('text' in p ? { text: p.text } : { inline_data: { mime_type: p.mime, data: p.image.toString('base64') } })),
        },
      ],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        // Assez de place pour une réponse JSON complète (sinon elle est coupée et illisible)
        maxOutputTokens: 8192,
        ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
      },
      ...(req.search ? { tools: [{ google_search: {} }] } : {}),
    };
    for (let attempt = 0; ; attempt++) {
      await this.spacer.wait();
      const res = await fetch(`${GEMINI}/models/${encodeURIComponent(this.name)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const json: any = await res.json().catch(() => ({}));
      if (res.status === 503 && attempt < 1) {
        await sleep(3000); // surcharge passagère : un seul nouvel essai
        continue;
      }
      // Modèle surchargé (« high demand ») : il se repose 2 min, l'IA suivante prend le relais (autre Gemini, Groq…)
      if (res.status === 503) throw new RateLimited(120_000, false, String(json?.error?.message || 'Modèle surchargé').slice(0, 220));
      if (res.status === 429) {
        const q = parseGoogleQuota(json);
        throw new RateLimited(q.retryMs, q.daily, q.detail);
      }
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        if (/no longer available|not found|is not supported|deprecated|unknown model/i.test(msg)) {
          throw new ModelGone(msg, msg.match(/use\s+models\/([a-z0-9.-]{3,60})/i)?.[1] || null);
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiUnavailable(`Gemini refuse la requête : ${msg}`);
        throw new Error(`Gemini : ${msg}`);
      }
      const cand = json?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
      const sources = (cand?.groundingMetadata?.groundingChunks || [])
        .map((c: any) => c?.web)
        .filter((w: any) => w?.uri)
        .map((w: any) => ({ uri: String(w.uri), title: w.title ? String(w.title) : undefined }));
      return { text, sources };
    }
  }
}

/**
 * IA de secours au format OpenAI (Groq, OpenRouter, Mistral… souvent avec un palier gratuit) :
 * sert à la vérification des photos (vision), pas à la recherche Google.
 */
class OpenAiCompatible implements Provider {
  readonly search = false;
  private readonly spacer: Spacer;
  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    readonly name: string,
    rpm: number,
  ) {
    this.spacer = new Spacer(rpm);
  }
  get label() {
    return `${new URL(this.baseUrl).hostname.replace(/^api\./, '')} ${this.name}`;
  }

  async call(req: AiRequest): Promise<AiResponse> {
    if (req.search) throw new AiUnavailable('Recherche Google indisponible sur ce fournisseur.');
    const content = req.parts.map((p) =>
      'text' in p ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.image.toString('base64')}` } },
    );
    if (req.schema) content.push({ type: 'text', text: `Réponds uniquement avec un objet JSON conforme à ce schéma : ${JSON.stringify(req.schema)}` });
    await this.spacer.wait();
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.name,
        temperature: req.temperature ?? 0.2,
        messages: [{ role: 'user', content }],
        ...(req.schema ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      throw new RateLimited(Number.isFinite(after) && after > 0 ? after * 1000 + 500 : 30_000, false);
    }
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new AiUnavailable(`IA de secours refusée : ${msg}`);
      throw new Error(`IA de secours : ${msg}`);
    }
    return { text: String(json?.choices?.[0]?.message?.content || ''), sources: [] };
  }
}

/**
 * Accès aux IA avec secours, pensé pour les paliers gratuits :
 * - Gemini : modèle configuré, puis les autres modèles « flash » de la clé (chacun a son propre quota), appels espacés ;
 * - limite atteinte → délai exact donné par Google, passage immédiat au modèle suivant ;
 * - IA de secours au format OpenAI (facultative) pour la vérification des photos ;
 * - tout est épuisé → `AiQuotaExceeded` (le lot est mis en pause et reprend tout seul).
 */
@Injectable()
export class GeminiClient implements AiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly key: string | null;
  private readonly rpm: number;
  private providers: Provider[] = [];
  private readonly cooldown = new Map<string, number>();
  private readonly reported = new Map<string, number>();
  /** Recherche Google refusée par tous les modèles (quota gratuit) : on ne la redemande pas avant cette heure */
  private searchBlockedUntil = 0;
  private discovered = false;

  constructor(config: ConfigService) {
    this.key = config.get<string | null>('ai.geminiApiKey') || null;
    this.rpm = config.get<number>('ai.geminiRpm') || 8;
    const models = [config.get<string>('ai.geminiModel') || DEFAULT_GEMINI_MODEL, ...(config.get<string[]>('ai.geminiFallbackModels') || [])];
    if (this.key) for (const m of [...new Set(models)]) this.providers.push(new GeminiModel(this.key, m, this.rpm));
    const fb = config.get<{ url: string | null; key: string | null; model: string | null; rpm: number }>('ai.fallback');
    if (fb?.url && fb.key && fb.model) this.providers.push(new OpenAiCompatible(fb.url, fb.key, fb.model, fb.rpm || 20));
  }

  get enabled() {
    return this.providers.length > 0;
  }

  get model() {
    return this.providers[0]?.name || '—';
  }

  /** Fournisseurs dans l'ordre d'essai (affiché à l'admin) */
  describe() {
    const now = Date.now();
    const searchBlocked = this.searchBlockedUntil > now ? new Date(this.searchBlockedUntil) : null;
    return this.providers.map((p) => ({
      label: p.label,
      search: p.search,
      coolingUntil: (() => {
        const until = Math.max(this.cooldown.get(p.name) ?? 0, this.cooldown.get(`${p.name}#search`) ?? 0);
        return until > now ? new Date(until) : null;
      })(),
      searchBlockedUntil: p.search ? searchBlocked : null,
    }));
  }

  /** Autres modèles « flash » stables de la clé (découverts une fois) : autant de quotas gratuits en plus */
  private async discover() {
    if (this.discovered || !this.key) return;
    this.discovered = true;
    try {
      const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': this.key }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return;
      const json: any = await res.json();
      const known = new Set(this.providers.map((p) => p.name));
      const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
      const extra = (json?.models || [])
        .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: any) => String(m.name).replace(/^models\//, ''))
        .filter((n: string) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n) && !known.has(n))
        .sort((a: string, b: string) => version(b) - version(a) || Number(a.includes('lite')) - Number(b.includes('lite')))
        .slice(0, 4);
      const at = this.providers.findIndex((p) => !(p instanceof GeminiModel));
      const added = extra.map((n: string) => new GeminiModel(this.key!, n, this.rpm));
      this.providers.splice(at < 0 ? this.providers.length : at, 0, ...added);
      if (added.length) this.logger.log(`Modèles Gemini de secours : ${extra.join(', ')}`);
    } catch {
      /* découverte facultative */
    }
  }

  async generate(req: AiRequest): Promise<AiResponse> {
    if (!this.enabled) throw new AiUnavailable("Aucune IA n'est configurée : ajoutez GEMINI_API_KEY dans l'environnement du serveur.");
    await this.discover();
    // La recherche Google a son propre quota (souvent très faible en gratuit) : elle ne bloque jamais le reste
    if (req.search && this.searchBlockedUntil > Date.now()) {
      throw new AiQuotaExceeded('Recherche Google indisponible (quota gratuit) : sources libres utilisées.', new Date(this.searchBlockedUntil));
    }
    // Quotas séparés : génération simple / génération avec recherche Google
    const key = (p: Provider) => (req.search ? `${p.name}#search` : p.name);
    for (let round = 0; round < 3; round++) {
      const usable = this.providers.filter((p) => !req.search || p.search);
      if (!usable.length) throw new AiQuotaExceeded('Aucune IA capable de chercher sur Google.', new Date(Date.now() + DAILY_COOLDOWN_MS));
      for (const p of usable) {
        if ((this.cooldown.get(key(p)) ?? 0) > Date.now()) continue;
        try {
          return await p.call(req);
        } catch (e) {
          if (e instanceof RateLimited) {
            this.cooldown.set(key(p), Date.now() + e.retryMs);
            // Le vrai message de Google, une fois par fournisseur et par heure (pour comprendre quel quota bloque)
            const said = this.reported.get(p.name) ?? 0;
            if (Date.now() - said > 3600_000 && e.detail) {
              this.reported.set(p.name, Date.now());
              this.logger.warn(`${p.label} : ${e.detail}`);
            }
            this.logger.warn(`${p.label} : quota ${e.daily ? 'du jour' : 'par minute'} atteint${req.search ? ' (recherche Google)' : ''}, on passe au suivant (${Math.round(e.retryMs / 1000)} s)`);
            continue;
          }
          // Réponse trop lente / réseau coupé : ce fournisseur se repose une minute, on essaie le suivant
          if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError' || e instanceof TypeError)) {
            this.cooldown.set(key(p), Date.now() + 60_000);
            this.logger.warn(`${p.label} : pas de réponse (${e.message}), on passe au suivant`);
            continue;
          }
          if (e instanceof ModelGone) {
            this.providers = this.providers.filter((x) => x !== p);
            if (e.suggestion && this.key && !this.providers.some((x) => x.name === e.suggestion)) {
              this.providers.unshift(new GeminiModel(this.key, e.suggestion, this.rpm));
              this.logger.warn(`Modèle Gemini « ${p.name} » retiré : passage à « ${e.suggestion} ». Indiquez GEMINI_MODEL=${e.suggestion} dans l'environnement.`);
            } else this.logger.warn(`Modèle « ${p.name} » indisponible : ${e.message}`);
            if (!this.providers.some((x) => !req.search || x.search)) {
              throw new AiUnavailable(`Le modèle Gemini « ${p.name} » n'est pas disponible pour cette clé : choisissez-en un autre avec GEMINI_MODEL (${e.message})`);
            }
            round--;
            break;
          }
          throw e;
        }
      }
      // Tous en pause : attendre si c'est court, sinon mettre le travail en pause
      const candidates = this.providers.filter((p) => !req.search || p.search);
      const soonest = Math.min(...candidates.map((p) => this.cooldown.get(key(p)) ?? 0));
      if (!candidates.length) break;
      // Recherche refusée partout : pas d'attente, on bascule tout de suite sur les sources libres pour 15 min au moins
      if (req.search && soonest > Date.now()) {
        this.searchBlockedUntil = Math.max(soonest, Date.now() + SEARCH_BLOCK_MS);
        this.logger.warn(`Recherche Google refusée par tous les modèles (quota gratuit) : sources libres (Wikidata, Wikimedia) jusqu'à ${new Date(this.searchBlockedUntil).toLocaleTimeString('fr-FR')}`);
        throw new AiQuotaExceeded('Recherche Google indisponible (quota gratuit).', new Date(this.searchBlockedUntil));
      }
      const wait = soonest - Date.now();
      if (wait <= 0) continue;
      if (wait > MAX_WAIT_MS) throw new AiQuotaExceeded('Quota gratuit atteint pour toutes les IA disponibles.', new Date(soonest));
      await sleep(wait);
    }
    const soonest = Math.min(...this.providers.map((p) => this.cooldown.get(key(p)) ?? Date.now() + DAILY_COOLDOWN_MS));
    throw new AiQuotaExceeded('Quota gratuit atteint pour toutes les IA disponibles.', new Date(Math.max(soonest, Date.now() + 60_000)));
  }
}

/** Extrait le premier objet / tableau JSON d'une réponse texte (bloc ```json … ``` ou texte libre) */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  for (let end = raw.length; end > start; end--) {
    const ch = raw[end - 1];
    if (ch !== '}' && ch !== ']') continue;
    try {
      return JSON.parse(raw.slice(start, end)) as T;
    } catch {
      /* on raccourcit jusqu'à trouver un JSON valide */
    }
  }
  return null;
}
