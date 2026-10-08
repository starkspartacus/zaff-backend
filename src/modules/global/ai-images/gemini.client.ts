import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google Gemini par l'API REST (clé `GEMINI_API_KEY`, envoyée en en-tête, jamais dans l'adresse ni dans les journaux) */
@Injectable()
export class GeminiClient implements AiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly key: string | null;
  readonly model: string;

  constructor(config: ConfigService) {
    this.key = config.get<string | null>('ai.geminiApiKey') || null;
    this.model = config.get<string>('ai.geminiModel') || 'gemini-2.5-flash';
  }

  get enabled() {
    return !!this.key;
  }

  async generate(req: AiRequest): Promise<AiResponse> {
    if (!this.key) throw new AiUnavailable("La clé GEMINI_API_KEY n'est pas configurée sur le serveur.");
    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: req.parts.map((p) => ('text' in p ? { text: p.text } : { inline_data: { mime_type: p.mime, data: p.image.toString('base64') } })),
        },
      ],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
      },
      ...(req.search ? { tools: [{ google_search: {} }] } : {}),
    };

    // Quota dépassé (429) ou surcharge (503) : nouvelle tentative après une pause croissante
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if ((res.status === 429 || res.status === 503) && attempt < 4) {
        const wait = 5000 * 2 ** attempt;
        this.logger.warn(`Gemini ${res.status} : nouvelle tentative dans ${wait / 1000} s`);
        await sleep(wait);
        continue;
      }
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        if (res.status === 400 || res.status === 403) throw new AiUnavailable(`Gemini refuse la requête : ${msg}`);
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
