import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { DevicesService } from '../devices/devices.service';
import { imageKey } from '../images/images.service';
import { AI_CLIENT, AiClient, AiPart, AiQuotaExceeded, AiUnavailable, parseJsonLoose } from './gemini.client';
import { AiImageCandidate, AiImageCandidateDocument, AiImageJob, AiImageJobDocument } from './ai-images.schemas';
import { ImageRejected, NormalizedImage, normalizeProductImage } from './image-normalize';
import {
  brandTokens,
  commonsFilesUrl,
  commonsSearchUrl,
  domainOf,
  extractImageUrls,
  modelTokens,
  openverseSearchUrl,
  parseCommons,
  parseCommonsFiles,
  parseOpenverse,
  parseWikidataImages,
  parseWikidataSearch,
  wikidataEntitiesUrl,
  wikidataSearchUrl,
} from './image-sources';
import { safeFetch, SafeFetchOptions, FetchResult } from './safe-fetch';

export type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<FetchResult>;
export const PAGE_FETCHER = 'AI_PAGE_FETCHER';

export interface JobInput {
  deviceIds?: string[];
  /** Sélection automatique : appareils sans photo, les plus utilisés par les boutiques d'abord */
  selection?: 'missing-popular' | 'incomplete';
  /** `specs` : compléter les fiches (coloris officiels + codes couleur, capacités, fiche technique) */
  kind?: 'photos' | 'specs';
  limit?: number;
  auto?: boolean;
  minScore?: number;
  perDevice?: number;
}

interface Device {
  id: string;
  category: string;
  brand: string;
  model: string;
  colors: string[];
  variants: string[];
}

type ModelMatch = 'exact' | 'same-line' | 'unsure' | 'different';

interface Verdict {
  index: number;
  /** Ancien format (oui / non), encore accepté */
  sameModel?: boolean;
  modelMatch?: ModelMatch;
  productPhoto: boolean;
  view: string;
  color: string | null;
  cleanBackground: boolean;
  textOrWatermark: boolean;
  score: number;
  reason: string;
}

const MAX_DOWNLOADS = 14;
const MAX_REVIEWED = 10;
const MIN_KEEP_SCORE = 55;
/** Note minimale d'une photo proposée « à défaut » quand aucune n'atteint MIN_KEEP_SCORE */
const MIN_FALLBACK_SCORE = 30;
/** Pénalité selon la certitude sur le modèle : une autre génération de la même gamme reste proposée, à valider */
const MATCH_PENALTY: Record<ModelMatch, number | null> = { exact: 0, 'same-line': 10, unsure: 20, different: null };
const MATCH_LABEL: Record<ModelMatch, string> = { exact: 'modèle exact', 'same-line': 'même gamme, génération à confirmer', unsure: 'modèle probable, à confirmer', different: 'autre modèle' };

const matchOf = (v: Verdict): ModelMatch =>
  v.modelMatch && v.modelMatch in MATCH_PENALTY ? v.modelMatch : v.sameModel === true ? 'exact' : v.sameModel === false ? 'different' : 'unsure';

/** Indice donné au vérificateur : titre du fichier Wikimedia, sinon adresse de la page */
const sourceHint = (x: { url: string; page: string | null }) => {
  const ref = x.page || x.url;
  try {
    const u = new URL(ref);
    const file = decodeURIComponent(u.pathname.split('/').pop() || '').replace(/^File:/i, '');
    return /wikimedia|wikipedia/.test(u.hostname) ? `file "${file.replace(/_/g, ' ')}"` : `${u.hostname}${decodeURIComponent(u.pathname).slice(0, 80)}`;
  } catch {
    return null;
  }
};
// Un appareil à la fois : les paliers gratuits des IA limitent le nombre de requêtes par minute
const DEVICE_CONCURRENCY = 1;

const VERDICT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    images: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER' },
          modelMatch: { type: 'STRING', enum: ['exact', 'same-line', 'unsure', 'different'] },
          productPhoto: { type: 'BOOLEAN' },
          view: { type: 'STRING', enum: ['front', 'back', 'front-and-back', 'angle', 'side', 'multiple', 'lifestyle', 'box', 'other'] },
          color: { type: 'STRING', nullable: true },
          cleanBackground: { type: 'BOOLEAN' },
          textOrWatermark: { type: 'BOOLEAN' },
          score: { type: 'INTEGER' },
          reason: { type: 'STRING' },
        },
        required: ['index', 'modelMatch', 'productPhoto', 'view', 'cleanBackground', 'textOrWatermark', 'score', 'reason'],
      },
    },
  },
  required: ['images'],
};

const SPECS_BATCH = 4;

/** « Apple » + « Apple Watch Ultra 3 » → « Apple Watch Ultra 3 » (pas de marque en double) */
const displayName = (d: { brand: string; model: string }) => (d.model.toLowerCase().startsWith(d.brand.toLowerCase()) ? d.model : `${d.brand} ${d.model}`);

interface SpecsFacts {
  id: string;
  known: boolean;
  colors?: { name: string; hex?: string | null }[];
  variants?: string[];
  specs?: { label: string; value: string }[];
}

const SPECS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    devices: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'INTEGER' },
          id: { type: 'STRING' },
          name: { type: 'STRING' },
          known: { type: 'BOOLEAN' },
          colors: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, hex: { type: 'STRING' } }, required: ['name'] } },
          variants: { type: 'ARRAY', items: { type: 'STRING' } },
          specs: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['label', 'value'] } },
        },
        required: ['id', 'known'],
      },
    },
  },
  required: ['devices'],
};

const sooner = (a: Date | null, b: Date) => (!a || b.getTime() < a.getTime() ? b : a);

/** Exécute `fn` sur la liste avec au plus `n` tâches en parallèle */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

/**
 * Photos des appareils trouvées par l'IA (Google Gemini) :
 * 1. recherche Google des photos officielles du modèle (pages fabricant / presse en priorité) ;
 * 2. téléchargement sécurisé, mise au format ZAFF (carré blanc WebP ≤ 1000 px + vignette) ;
 * 3. vérification par l'IA (bon modèle ? bon coloris ? vue de face, fond propre, sans texte) et note sur 100 ;
 * 4. meilleure photo par coloris proposée à l'admin, ou publiée directement (UploadThing) si la note est suffisante.
 * La publication passe par `DevicesService.addPhoto` : mêmes contrôles, anti-doublon, transmission aux boutiques.
 */
@Injectable()
export class AiImagesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiImagesService.name);
  private running: Promise<void> | null = null;
  private readonly fetcher: Fetcher;

  constructor(
    @InjectModel(AiImageJob.name, GLOBAL_CONNECTION) private readonly jobs: Model<AiImageJobDocument>,
    @InjectModel(AiImageCandidate.name, GLOBAL_CONNECTION) private readonly candidates: Model<AiImageCandidateDocument>,
    private readonly devices: DevicesService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    @Optional() @Inject(PAGE_FETCHER) fetcher?: Fetcher,
  ) {
    this.fetcher = fetcher || safeFetch;
  }

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    // Redémarrage pendant un traitement : le lot reprend où il s'était arrêté
    await this.jobs.updateMany({ status: 'running' }, { $set: { status: 'queued' } }).catch(() => undefined);
    this.kick();
  }

  status() {
    const providers = typeof (this.ai as any).describe === 'function' ? (this.ai as any).describe() : [{ label: this.ai.model, search: true, coolingUntil: null }];
    return { enabled: this.ai.enabled, model: this.ai.model, providers, freeSearch: 'Wikimedia Commons' };
  }

  // ─── Lots ───

  async createJob(input: JobInput) {
    if (!this.ai.enabled) throw new ServiceUnavailableException("L'IA n'est pas configurée : ajoutez GEMINI_API_KEY dans l'environnement du serveur.");
    const kind = input.kind === 'specs' ? 'specs' : 'photos';
    let ids = [...new Set((input.deviceIds || []).filter((id) => Types.ObjectId.isValid(id)))];
    let label = ids.length === 1 ? null : `${ids.length} appareils choisis`;
    if (!ids.length && kind === 'specs') {
      // Fiches incomplètes (sans coloris, sans capacités ou sans fiche technique), les plus utilisées d'abord
      const limit = Math.min(Math.max(input.limit || 25, 1), 200);
      const { items } = await this.devices.list({ sort: 'popular', limit: 200 });
      ids = items
        .filter((d) => d.active && (!d.colors.length || !d.variants.length || !d.specs.length || d.colorCodes.length < d.colors.length))
        .slice(0, limit)
        .map((d) => d.id);
      label = `Fiches de ${ids.length} appareils (coloris, capacités, fiche technique)`;
    }
    if (!ids.length && kind === 'photos') {
      const limit = Math.min(Math.max(input.limit || 20, 1), 200);
      // Appareils déjà en attente de validation : on ne les recherche pas une deuxième fois
      const waiting = new Set((await this.candidates.find({ status: 'pending' }).select('deviceId').lean().exec()).map((c: any) => c.deviceId));
      const { items } = await this.devices.list({ photos: 'missing', sort: 'popular', limit: 200 });
      ids = items.filter((d) => d.active && !waiting.has(d.id)).slice(0, limit).map((d) => d.id);
      label = `${ids.length} appareils sans photo (les plus utilisés d'abord)`;
    }
    if (!ids.length) {
      throw new BadRequestException(kind === 'specs' ? 'Toutes les fiches sont déjà complètes.' : 'Aucun appareil à traiter : tous ont déjà une photo ou une proposition en attente.');
    }
    if (ids.length === 1 && kind === 'specs') label = `Fiche de ${await this.devices.get(ids[0]).then((d) => `${d.brand} ${d.model}`).catch(() => '1 appareil')}`;
    if (ids.length === 1) label = label || (await this.devices.get(ids[0]).then((d) => `${d.brand} ${d.model}`).catch(() => '1 appareil'));
    const job = await this.jobs.create({
      kind,
      status: 'queued',
      deviceIds: ids,
      doneIds: [],
      log: [],
      processed: 0,
      found: 0,
      published: 0,
      notFound: 0,
      failures: 0,
      lastError: null,
      resumeAt: null,
      finishedAt: null,
      total: ids.length,
      auto: !!input.auto,
      minScore: Math.min(Math.max(input.minScore ?? 90, 50), 100),
      perDevice: Math.min(Math.max(input.perDevice ?? 4, 1), 8),
      label,
    });
    this.kick();
    return this.jobView(job);
  }

  private jobView(j: any) {
    return {
      id: String(j._id),
      kind: j.kind || 'photos',
      status: j.status,
      label: j.label,
      total: j.total,
      processed: j.processed,
      found: j.found,
      published: j.published,
      notFound: j.notFound,
      errors: j.failures || 0,
      auto: j.auto,
      minScore: j.minScore,
      lastError: j.lastError || null,
      log: (j.log || []).slice(-40).reverse(),
      resumeAt: j.resumeAt || null,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt || null,
    };
  }

  async listJobs() {
    const docs = await this.jobs.find({}).sort({ createdAt: -1 }).limit(20).lean().exec();
    return docs.map((j) => this.jobView(j));
  }

  async cancelJob(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lot introuvable.');
    await this.jobs.updateOne({ _id: id, status: { $in: ['queued', 'running', 'paused'] } }, { $set: { status: 'cancelled', finishedAt: new Date() } });
    return { cancelled: true };
  }

  /** Lance le traitement en arrière-plan (un lot à la fois) */
  kick() {
    if (this.running) return this.running;
    this.running = this.drain()
      .catch((e) => this.logger.error(`Traitement des photos IA : ${e.message}`))
      .finally(() => (this.running = null));
    return this.running;
  }

  private async drain() {
    for (;;) {
      const job: any = await this.jobs
        .findOneAndUpdate({ $or: [{ status: 'queued' }, { status: 'paused', resumeAt: { $lte: new Date() } }] }, { $set: { status: 'running', resumeAt: null } }, { new: true, sort: { createdAt: 1 } })
        .lean()
        .exec();
      if (!job) return this.scheduleResume();
      await this.runJob(job);
    }
  }

  private resumeTimer: NodeJS.Timeout | null = null;

  /** Lot en pause (quota gratuit) : réveil automatique à l'heure de reprise */
  private async scheduleResume() {
    const next: any = await this.jobs.findOne({ status: 'paused' }).sort({ resumeAt: 1 }).lean().exec();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    if (!next?.resumeAt) return;
    const ms = Math.max(5_000, new Date(next.resumeAt).getTime() - Date.now());
    this.resumeTimer = setTimeout(() => this.kick(), Math.min(ms, 2 ** 31 - 1));
    this.resumeTimer.unref?.();
  }

  private async isCancelled(id: unknown) {
    const j: any = await this.jobs.findById(id).select('status').lean().exec();
    return !j || j.status === 'cancelled';
  }

  private async runJob(job: any) {
    if (job.kind === 'specs') return this.runSpecsJob(job);
    const todo = (job.deviceIds as string[]).filter((id) => !(job.doneIds || []).includes(id));
    let stopped = false;
    const pause: { until: Date | null } = { until: null };
    await pool(todo, DEVICE_CONCURRENCY, async (deviceId) => {
      if (stopped || pause.until || (await this.isCancelled(job._id))) return void (stopped = stopped || !pause.until);
      const inc: Record<string, number> = { processed: 1 };
      let name = deviceId;
      const note = (result: 'found' | 'none' | 'error', detail: string) =>
        this.jobs.updateOne({ _id: job._id }, { $push: { log: { deviceId, name, result, detail: detail.slice(0, 600), at: new Date() } } });
      try {
        const device = await this.devices.get(deviceId);
        name = displayName(device);
        const r = await this.findForDevice(device, job);
        inc.found = r.kept;
        inc.published = r.published;
        if (!r.kept) inc.notFound = 1;
        await note(r.kept ? 'found' : 'none', r.detail);
      } catch (e: any) {
        // Quota gratuit épuisé partout : cet appareil sera repris avec le reste du lot
        if (e instanceof AiQuotaExceeded) {
          pause.until = sooner(pause.until, e.resumeAt);
          return;
        }
        inc.failures = 1;
        this.logger.warn(`Photos IA (${deviceId}) : ${e.message}`);
        await note('error', String(e.message));
        await this.jobs.updateOne({ _id: job._id }, { $set: { lastError: String(e.message).slice(0, 300) } });
        // Clé refusée / quota épuisé : inutile de continuer le lot
        if (e instanceof AiUnavailable) stopped = true;
      }
      await this.jobs.updateOne({ _id: job._id }, { $inc: inc, $addToSet: { doneIds: deviceId } });
    });
    if (await this.isCancelled(job._id)) return;
    if (pause.until && !stopped) {
      const at = pause.until;
      await this.jobs.updateOne(
        { _id: job._id },
        { $set: { status: 'paused', resumeAt: at, lastError: `Quota gratuit des IA atteint : reprise automatique vers ${at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` } },
      );
      this.logger.warn(`Photos IA en pause jusqu'à ${at.toISOString()} (quota gratuit)`);
      return;
    }
    await this.jobs.updateOne({ _id: job._id }, { $set: { status: stopped ? 'failed' : 'done', finishedAt: new Date() } });
  }

  // ─── Complétion des fiches par l'IA (texte seulement : peu de quota, 6 appareils par requête) ───

  private async runSpecsJob(job: any) {
    const todo = (job.deviceIds as string[]).filter((id) => !(job.doneIds || []).includes(id));
    let status: 'done' | 'failed' | 'paused' = 'done';
    let resumeAt: Date | null = null;
    for (let i = 0; i < todo.length; i += SPECS_BATCH) {
      if (await this.isCancelled(job._id)) return;
      const batch: Device[] = [];
      for (const id of todo.slice(i, i + SPECS_BATCH)) {
        const d = await this.devices.get(id).catch(() => null);
        if (d) batch.push(d);
      }
      let facts: SpecsFacts[];
      try {
        facts = await this.askSpecs(batch);
        // Appareils oubliés ou réponse coupée : nouvel essai, un par un
        for (const d of batch.filter((x) => !facts.some((f) => f.id === x.id))) {
          const [one] = await this.askSpecs([d]).catch((e) => {
            if (e instanceof AiQuotaExceeded || e instanceof AiUnavailable) throw e;
            return [] as SpecsFacts[];
          });
          if (one) facts.push({ ...one, id: d.id });
        }
      } catch (e: any) {
        if (e instanceof AiQuotaExceeded) {
          status = 'paused';
          resumeAt = e.resumeAt;
          break;
        }
        await this.jobs.updateOne({ _id: job._id }, { $set: { lastError: String(e.message).slice(0, 300) } });
        if (e instanceof AiUnavailable) {
          status = 'failed';
          break;
        }
        facts = [];
      }
      for (const d of batch) {
        const f = facts.find((x) => x.id === d.id);
        let changed: string[] = [];
        if (f?.known) changed = await this.devices.applyAiFacts(d.id, f).catch(() => []);
        const detail = !f ? "Pas de réponse lisible de l'IA (réessayez plus tard)" : !f.known ? "Modèle inconnu de l'IA : rien n'a été inventé" : changed.length ? `Complété : ${changed.join(', ')}` : 'Déjà complet';
        await this.jobs.updateOne(
          { _id: job._id },
          {
            $inc: { processed: 1, found: changed.length ? 1 : 0, notFound: changed.length ? 0 : 1 },
            $addToSet: { doneIds: d.id },
            $push: { log: { deviceId: d.id, name: displayName(d), result: changed.length ? 'found' : 'none', detail, at: new Date() } },
          },
        );
      }
    }
    if (status === 'paused' && resumeAt) {
      await this.jobs.updateOne(
        { _id: job._id },
        { $set: { status: 'paused', resumeAt, lastError: `Quota gratuit des IA atteint : reprise automatique vers ${resumeAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` } },
      );
      return;
    }
    await this.jobs.updateOne({ _id: job._id }, { $set: { status, finishedAt: new Date() } });
  }

  private async askSpecs(batch: Device[]): Promise<SpecsFacts[]> {
    const list = batch.map((d, i) => `${i + 1}. id ${d.id} : ${displayName(d)} (${d.category})`).join('\n');
    const res = await this.ai.generate({
      temperature: 0,
      schema: SPECS_SCHEMA,
      parts: [
        {
          text: [
            'You fill a product catalogue for phone / computer shops in West Africa (French-speaking).',
            'For each device below give the facts sold on the market: official colours (official marketing name, in French when the',
            'brand sells it under a French name, with the closest hex colour code), storage / RAM configurations actually sold',
            '(format "128 Go", "8 Go + 256 Go", "16 Go / 512 Go SSD"), and up to 8 key specs with French labels',
            '(Écran, Processeur, Mémoire vive, Stockage, Appareil photo, Batterie, Système, Réseau…) and short French values.',
            'If you do not know this exact model for sure, set known=false and leave every list empty: NEVER invent.',
            'Return exactly one entry per device, in the same order, with its number "n" and its exact "id".',
            `Devices:\n${list}`,
          ].join('\n'),
        },
      ],
    });
    const answers = parseJsonLoose<{ devices?: Array<SpecsFacts & { n?: number; name?: string }> }>(res.text)?.devices || [];
    // Rattachement par identifiant, sinon par numéro, sinon par nom (l'IA recopie parfois mal les identifiants)
    const out: SpecsFacts[] = [];
    batch.forEach((d, i) => {
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
      const a =
        answers.find((x) => x?.id === d.id) ||
        answers.find((x) => Number(x?.n) === i + 1) ||
        answers.find((x) => x?.name && norm(x.name).includes(norm(d.model))) ||
        (batch.length === 1 && answers.length === 1 ? answers[0] : undefined);
      if (a) out.push({ ...a, id: d.id });
    });
    return out;
  }

  // ─── Recherche pour un appareil ───

  private async searchSources(device: Device) {
    const colors = device.colors.length ? device.colors.join(', ') : 'all official colours';
    const prompt = [
      `Find official product photos of the device "${device.brand} ${device.model}" (category: ${device.category}).`,
      `Official colours: ${colors}.`,
      'Prefer the manufacturer website, its press / media kit, then large authorised retailers.',
      'Wanted: studio product shots on a plain white or light background, front view (or front + back), one device per image,',
      'no people, no lifestyle scene, no box, no price, no text overlay, no watermark, at least 800 px.',
      `Be careful not to confuse it with similar models (other generations or variants of ${device.brand}).`,
      'Reply ONLY with JSON: {"images":[{"url":"direct image URL","page":"page URL","color":"colour or null"}],"pages":["product page URL"]}.',
      'Give up to 10 images and 5 pages. Only URLs you actually found.',
    ].join('\n');
    let res;
    try {
      res = await this.ai.generate({ parts: [{ text: prompt }], search: true, temperature: 0.1 });
    } catch (e) {
      if (!(e instanceof AiQuotaExceeded)) throw e;
      // Recherche Google épuisée : photos libres de Wikimedia Commons (gratuit, sans clé, auteur et licence gardés)
      const free = await this.commons(device);
      return { images: free.images, notes: free.notes, pages: [] as string[], via: 'commons' as const };
    }
    const json = parseJsonLoose<{ images?: { url?: string; page?: string; color?: string | null }[]; pages?: string[] }>(res.text) || {};
    const images: Array<{ url?: string; page?: string; color?: string | null; credit?: string | null }> = (json.images || []).filter((i) => typeof i?.url === 'string').slice(0, 10);
    const pages = [...new Set([...(json.pages || []), ...images.map((i) => i.page || ''), ...res.sources.map((s) => s.uri)].filter((p) => typeof p === 'string' && /^https?:\/\//.test(p)))].slice(0, 6);
    return { images, pages, notes: [] as string[], via: 'ia' as const };
  }

  /** Wikimedia et Openverse limitent les robots : une requête à la fois, espacées d'au moins 1,2 s */
  private freeGate: Promise<unknown> = Promise.resolve();
  freeSpacingMs = 1200;

  private async getJson(url: string) {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await this.fetcher(url, { maxBytes: 2_000_000, timeoutMs: 10000, accept: 'application/json' });
          return JSON.parse(res.buffer.toString('utf8'));
        } catch (e) {
          // Trop de demandes : on patiente puis un seul nouvel essai
          if (attempt === 0 && /HTTP 429/.test((e as Error).message)) {
            await new Promise((r) => setTimeout(r, this.freeRetryMs));
            continue;
          }
          throw e;
        }
      }
    };
    const next = this.freeGate.then(run, run);
    this.freeGate = next.then(
      () => new Promise((r) => setTimeout(r, this.freeSpacingMs)),
      () => new Promise((r) => setTimeout(r, this.freeSpacingMs)),
    );
    return next;
  }

  /** Délai avant le nouvel essai après un 429 (raccourci dans les tests) */
  freeRetryMs = 8000;

  /**
   * Sources libres et gratuites (sans IA ni clé) : 1) photo de référence de la fiche Wikidata du modèle (choisie par
   * la communauté, très fiable) ; 2) recherche Wikimedia Commons sur le titre ; 3) Openverse (Flickr, Commons…, licences
   * permettant l'usage commercial). Auteur et licence gardés ; une source en panne est signalée au journal.
   */
  private async commons(device: Device) {
    const tokens = modelTokens(device.brand, device.model);
    const brand = brandTokens(device.brand);
    const images: Array<{ url: string; page?: string; credit: string | null }> = [];
    const notes: string[] = [];
    const add = (list: Array<{ url: string; page: string | null; credit: string | null }>) => {
      for (const x of list) if (!images.some((o) => o.url === x.url)) images.push({ url: x.url, page: x.page || undefined, credit: x.credit });
    };
    const failed = (source: string, e: unknown) => {
      const msg = (e as Error).message || 'erreur';
      notes.push(`${source} : ${/HTTP 429/.test(msg) ? 'trop de demandes, réessayez plus tard' : msg.slice(0, 60)}`);
    };
    try {
      const ids = parseWikidataSearch(await this.getJson(wikidataSearchUrl(device.brand, device.model)), tokens, brand);
      const files = ids.length ? parseWikidataImages(await this.getJson(wikidataEntitiesUrl(ids))) : [];
      if (files.length) add(parseCommonsFiles(await this.getJson(commonsFilesUrl(files))));
    } catch (e) {
      failed('Wikidata', e);
    }
    try {
      add(parseCommons(await this.getJson(commonsSearchUrl(device.brand, device.model)), tokens, 8, true, brand));
    } catch (e) {
      failed('Wikimedia Commons', e);
    }
    if (images.length < 6) {
      try {
        add(parseOpenverse(await this.getJson(openverseSearchUrl(device.brand, device.model)), tokens, brand));
      } catch (e) {
        failed('Openverse', e);
      }
    }
    return { images: images.slice(0, 10), notes };
  }

  private readonly credits = new Map<string, string>();

  private async collectUrls(device: Device, forceCommons = false) {
    const { images, pages, via, notes } = forceCommons ? { ...(await this.commons(device)), pages: [] as string[], via: 'commons' as const } : await this.searchSources(device);
    const urls = new Map<string, string | null>(); // photo → page d'origine
    for (const i of images) {
      if (!/^https?:\/\//.test(i.url!)) continue;
      urls.set(i.url!, i.page || null);
      if (i.credit) this.credits.set(i.url!, i.credit);
    }
    const tokens = modelTokens(device.brand, device.model);
    await pool(pages, 3, async (page) => {
      try {
        const res = await this.fetcher(page, { maxBytes: 2_000_000, timeoutMs: 8000, accept: 'text/html,application/xhtml+xml' });
        if (!/html|xml/i.test(res.contentType)) return;
        for (const u of extractImageUrls(res.buffer.toString('utf8'), res.url, tokens)) if (!urls.has(u)) urls.set(u, res.url);
      } catch {
        /* page inaccessible : on passe */
      }
    });
    return { list: [...urls.entries()].slice(0, MAX_DOWNLOADS), via, pages: pages.length, notes };
  }

  private async downloadAll(list: [string, string | null][]) {
    const out: Array<{ url: string; page: string | null; img: NormalizedImage; sha256: string; credit: string | null }> = [];
    const seen = new Set<string>();
    const refused = new Map<string, number>();
    const throttled = new Set<string>(); // sites qui ont répondu 429 : on n'insiste pas
    await pool(list, 2, async ([url, page]) => {
      const host = domainOf(url) || '';
      if (throttled.has(host)) return void refused.set('site saturé', (refused.get('site saturé') || 0) + 1);
      try {
        const res = await this.fetcher(url, { maxBytes: 8_000_000, timeoutMs: 12000, accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', referer: page });
        const img = await normalizeProductImage(res.buffer);
        const sha256 = createHash('sha256').update(img.full).digest('hex');
        if (seen.has(sha256)) return;
        seen.add(sha256);
        out.push({ url: res.url, page, img, sha256, credit: this.credits.get(url) || null });
      } catch (e) {
        const msg = (e as Error).message || 'erreur';
        if (/HTTP 429/.test(msg)) throttled.add(host);
        const reason = e instanceof ImageRejected ? msg.replace(/\s*\(.*\)$/, '') : msg.slice(0, 40);
        refused.set(reason, (refused.get(reason) || 0) + 1);
      }
    });
    return { imgs: out.slice(0, MAX_REVIEWED), refused };
  }

  private async review(device: Device, imgs: Array<{ img: NormalizedImage; url: string; page: string | null }>): Promise<Verdict[]> {
    const parts: AiPart[] = [
      {
        text: [
          `You check product photos for a phone/computer shop catalogue. Expected device: "${device.brand} ${device.model}" (${device.category}).`,
          `Known official colours: ${device.colors.join(', ') || 'unknown'}.`,
          'For each numbered image, tell modelMatch:',
          '- "exact": this model (design matches; the source title naming this model counts as evidence);',
          '- "same-line": same product line but possibly another generation/size/variant (e.g. an older "Aspire 5" for "Aspire 5"); many names (Aspire 5, Galaxy A, IdeaPad 3…) cover several generations: that is NOT "different";',
          '- "unsure": you cannot tell, nothing contradicts it;',
          '- "different": clearly another product (another model name visible or in the source title, another line, another device type, obviously different design such as camera count or notch).',
          'Then:',
          'productPhoto (studio shot of the device itself, not a box, not a person, not a screenshot), view, color (one of the known colours if possible),',
          'cleanBackground (plain white/light), textOrWatermark (any text, price, logo overlay or watermark added on the picture),',
          'score 0-100 for use as the main catalogue photo (100 = perfect official front shot on white), and a short reason IN FRENCH.',
          'Be strict on photo quality; for the model, use "different" only with clear evidence.',
        ].join('\n'),
      },
    ];
    imgs.forEach((x, i) => {
      const hint = sourceHint(x);
      parts.push({ text: `Image ${i}${hint ? ` (source: ${hint})` : ''}:` }, { image: x.img.review, mime: 'image/jpeg' });
    });
    const res = await this.ai.generate({ parts, schema: VERDICT_SCHEMA, temperature: 0 });
    const json = parseJsonLoose<{ images?: Verdict[] }>(res.text);
    return (json?.images || []).filter((v) => Number.isInteger(v?.index) && v.index >= 0 && v.index < imgs.length);
  }

  /** Coloris de l'IA ramené à un coloris officiel de l'appareil (inconnu : tous coloris) */
  private matchColor(device: Device, color: string | null | undefined) {
    const clean = color?.trim();
    if (!clean || /^(null|none|unknown|inconnu)$/i.test(clean)) return null;
    const k = imageKey(clean);
    // Appareil sans coloris connus : celui reconnu par l'IA est gardé (il s'ajoutera à l'appareil à la publication)
    if (!device.colors.length) return clean.charAt(0).toUpperCase() + clean.slice(1).slice(0, 59);
    return device.colors.find((c) => imageKey(c) === k) || device.colors.find((c) => imageKey(c).includes(k) || k.includes(imageKey(c))) || null;
  }

  async findForDevice(device: Device, job: { _id: unknown; auto: boolean; minScore: number; perDevice: number }) {
    let found = await this.collectUrls(device);
    let dl = await this.downloadAll(found.list);
    const notes: string[] = [];
    const describe = (f: typeof found, d: typeof dl) => {
      const refusals = [...d.refused.entries()].map(([r, n]) => `${r} ×${n}`).join(', ');
      const issues = f.notes.length ? ` [${f.notes.join(' ; ')}]` : '';
      return `${f.via === 'commons' ? 'Sources libres (Wikidata, Wikimedia, Openverse)' : 'Recherche IA'} : ${f.list.length} photo(s) repérée(s)${f.pages ? ` dans ${f.pages} page(s)` : ''}, ${d.imgs.length} utilisable(s)${refusals ? ` (refus : ${refusals})` : ''}${issues}`;
    };
    notes.push(describe(found, dl));
    // Sites des fabricants inaccessibles : on tente les photos libres de Wikimedia
    if (!dl.imgs.length && found.via === 'ia') {
      found = await this.collectUrls(device, true);
      dl = await this.downloadAll(found.list);
      notes.push(describe(found, dl));
    }
    const imgs = dl.imgs;
    if (!imgs.length) return { kept: 0, published: 0, detail: notes.join(' · ') };
    const verdicts = await this.review(device, imgs);

    // Score final : celui de l'IA, pénalisé si texte / fond chargé / vue de profil
    const scored = verdicts
      .map((v) => {
        let score = Math.max(0, Math.min(100, Math.round(v.score)));
        if (v.textOrWatermark) score -= 25;
        if (!v.cleanBackground) score -= 15;
        if (!['front', 'front-and-back', 'angle'].includes(v.view)) score -= 15;
        const match = matchOf(v);
        score -= MATCH_PENALTY[match] ?? 100;
        return { v, match, x: imgs[v.index], score: Math.max(0, score), color: this.matchColor(device, v.color) };
      })
      .filter((s) => MATCH_PENALTY[s.match] !== null && s.v.productPhoto)
      .sort((a, b) => b.score - a.score);
    const good = scored.filter((s) => s.score >= MIN_KEEP_SCORE);
    // Aucune photo de catalogue (souvent : photos libres prises en magasin) : la meilleure du bon modèle est proposée
    // « à défaut », à valider par l'admin, jamais publiée automatiquement
    const fallback = !good.length && scored[0] && scored[0].score >= MIN_FALLBACK_SCORE ? [scored[0]] : [];
    const kept = good.length ? good : fallback;

    // La meilleure photo de chaque coloris (et la meilleure tous coloris confondus)
    const chosen: typeof scored = [];
    const colorsTaken = new Set<string>();
    for (const s of kept) {
      const key = s.color ? imageKey(s.color) : '';
      if (colorsTaken.has(key) && chosen.length) continue;
      colorsTaken.add(key);
      chosen.push(s);
      if (chosen.length >= job.perDevice) break;
    }

    let published = 0;
    for (const s of chosen) {
      const exists = await this.candidates.findOne({ deviceId: device.id, sha256: s.x.sha256 }).select('_id').lean().exec();
      if (exists) continue;
      const cand: any = await this.candidates.create({
        jobId: String(job._id),
        deviceId: device.id,
        color: s.color,
        score: s.score,
        verdict: { modelMatch: s.match, fallback: fallback.includes(s), view: s.v.view, cleanBackground: s.v.cleanBackground, textOrWatermark: s.v.textOrWatermark, aiScore: s.v.score, reason: s.v.reason, aiColor: s.v.color || null, credit: s.x.credit },
        sourceUrl: s.x.url,
        pageUrl: s.x.page,
        sha256: s.x.sha256,
        full: s.x.img.full,
        thumb: s.x.img.thumb,
        bytes: s.x.img.full.length,
        status: 'pending',
        imageId: null,
        error: null,
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      });
      // Publication automatique : seulement le modèle exact (une autre génération attend la validation de l'admin)
      if (job.auto && s.match === 'exact' && !fallback.includes(s) && s.score >= job.minScore) {
        const r = await this.publish(String(cand._id)).catch(() => null);
        if (r?.status === 'published') published++;
      }
    }
    const counts = new Map<string, number>();
    for (const v of verdicts) {
      const m = matchOf(v);
      if (m !== 'exact') counts.set(MATCH_LABEL[m], (counts.get(MATCH_LABEL[m]) || 0) + 1);
      if (!v.productPhoto) counts.set('pas une photo produit', (counts.get('pas une photo produit') || 0) + 1);
    }
    const tally = [...counts.entries()].map(([k, n]) => `${n} ${k}`).join(', ');
    notes.push(`Vérification : ${chosen.length} retenue(s)${fallback.length ? ' à défaut (photo de qualité moyenne, à valider)' : ''} sur ${imgs.length}${verdicts.length < imgs.length ? ` (${imgs.length - verdicts.length} sans avis)` : ''}${tally ? `, ${tally}` : ''}`);
    // Raisons des photos écartées : l'admin comprend pourquoi rien n'a été retenu
    if (!good.length) {
      const why = [...new Set(verdicts.filter((v) => !good.some((s) => s.v === v)).map((v) => String(v.reason || '').trim()).filter(Boolean))].slice(0, 2);
      if (why.length) notes.push(`Écartées : ${why.map((r) => (r.length > 110 ? `${r.slice(0, 107)}…` : r)).join(' ; ')}`);
    }
    return { kept: chosen.length, published, detail: notes.join(' · ') };
  }

  // ─── Propositions ───

  private candidateView(c: any, device?: { brand: string; model: string; category: string; photos: number }) {
    return {
      id: String(c._id),
      jobId: c.jobId,
      deviceId: c.deviceId,
      device: device || null,
      color: c.color || null,
      score: c.score,
      verdict: c.verdict || {},
      source: domainOf(c.pageUrl || c.sourceUrl),
      sourceUrl: c.sourceUrl,
      pageUrl: c.pageUrl || null,
      bytes: c.bytes,
      status: c.status,
      imageId: c.imageId || null,
      error: c.error || null,
      createdAt: c.createdAt,
    };
  }

  async listCandidates(q: { status?: string; jobId?: string; deviceId?: string }) {
    const filter: Record<string, unknown> = { status: q.status || 'pending' };
    if (q.jobId) filter.jobId = q.jobId;
    if (q.deviceId) filter.deviceId = q.deviceId;
    const docs: any[] = await this.candidates.find(filter).select('-full -thumb').sort({ score: -1 }).limit(300).lean().exec();
    const info = new Map<string, any>();
    for (const id of new Set(docs.map((d) => d.deviceId))) {
      const d = await this.devices.get(id).catch(() => null);
      if (d) info.set(id, { brand: d.brand, model: d.model, category: d.category, photos: d.photos.length });
    }
    return docs.map((c) => this.candidateView(c, info.get(c.deviceId)));
  }

  async preview(id: string, size: 'thumb' | 'full') {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Photo introuvable.');
    const c: any = await this.candidates.findById(id).select(size).lean().exec();
    const data = c?.[size];
    if (!data) throw new NotFoundException('Photo introuvable ou déjà traitée.');
    return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer ?? data);
  }

  /** Publication : la photo part chez UploadThing (via le catalogue) et les boutiques la reçoivent */
  async publish(id: string, color?: string | null) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Photo introuvable.');
    const c: any = await this.candidates.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: 'failed', error: 'Publication en cours…' } }, { new: true }).lean().exec();
    if (!c) throw new BadRequestException('Cette photo a déjà été traitée.');
    const full = Buffer.isBuffer(c.full) ? c.full : Buffer.from(c.full?.buffer ?? c.full);
    const thumb = c.thumb ? (Buffer.isBuffer(c.thumb) ? c.thumb : Buffer.from(c.thumb.buffer ?? c.thumb)) : undefined;
    try {
      const chosenColor = color === undefined ? c.color : color || null;
      const r = await this.devices.addPhoto(c.deviceId, { buffer: full, size: full.length }, thumb ? { buffer: thumb, size: thumb.length } : undefined, chosenColor);
      await this.candidates.updateOne({ _id: c._id }, { $set: { status: 'published', imageId: r.image.id, color: chosenColor, full: null, thumb: null, error: null } });
      return { status: 'published' as const, imageId: r.image.id, device: r.device };
    } catch (e: any) {
      await this.candidates.updateOne({ _id: c._id }, { $set: { status: 'pending', error: String(e.message).slice(0, 300) } });
      throw e;
    }
  }

  async reject(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Photo introuvable.');
    await this.candidates.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'rejected', full: null, thumb: null } });
    return { rejected: true };
  }

  /** Validation en masse : les photos choisies, ou toutes celles d'un lot au-dessus d'une note */
  async publishMany(input: { ids?: string[]; jobId?: string; minScore?: number }) {
    let ids = (input.ids || []).filter((id) => Types.ObjectId.isValid(id));
    if (!ids.length && (input.jobId || input.minScore !== undefined)) {
      const filter: Record<string, unknown> = { status: 'pending', score: { $gte: input.minScore ?? 80 } };
      if (input.jobId) filter.jobId = input.jobId;
      ids = (await this.candidates.find(filter).select('_id').lean().exec()).map((c: any) => String(c._id));
    }
    let published = 0;
    const failed: string[] = [];
    for (const id of ids.slice(0, 300)) {
      try {
        await this.publish(id);
        published++;
      } catch {
        failed.push(id);
      }
    }
    return { published, failed: failed.length };
  }
}
