import { Logger } from '@nestjs/common';
import { UTApi, UTFile } from 'uploadthing/server';

/** Où sont rangés les fichiers des photos (et demain des vidéos) */
export interface StoredFile {
  /** Clé chez le fournisseur (null : fichier gardé dans MongoDB) */
  key: string | null;
  /** Adresse publique directe (null : servi par l'API) */
  url: string | null;
}

export interface RemoteFile {
  key: string;
  customId: string | null;
  uploadedAt: number;
}

export interface MediaStorage {
  readonly name: 'uploadthing' | 'database';
  put(data: Buffer, opts: { name: string; mime: string; customId: string }): Promise<StoredFile>;
  remove(keys: string[]): Promise<void>;
  /** Fichiers présents chez le fournisseur (pour supprimer ceux qu'aucune fiche ne référence) */
  list?(): Promise<RemoteFile[]>;
}

export const MEDIA_STORAGE = 'MEDIA_STORAGE';
/** Préfixe des identifiants ZAFF chez UploadThing : on ne touche jamais aux autres fichiers du compte */
export const CUSTOM_ID_PREFIX = 'zaff-';

/** Sans UploadThing : le fichier reste dans le document MongoDB (développement, petits volumes) */
export class DatabaseStorage implements MediaStorage {
  readonly name = 'database' as const;
  async put(): Promise<StoredFile> {
    return { key: null, url: null };
  }
  async remove(): Promise<void> {}
}

/** Sous-ensemble de l'API UploadThing utilisé (remplaçable par un faux dans les tests) */
export interface UploadThingClient {
  uploadFiles(file: UTFile): Promise<{ data: { key: string; ufsUrl: string } | null; error: { message: string } | null }>;
  deleteFiles(keys: string[]): Promise<{ success: boolean; deletedCount: number }>;
  listFiles(opts: { limit: number; offset: number }): Promise<{ files: readonly RemoteFile[]; hasMore: boolean }>;
}

export class UploadThingStorage implements MediaStorage {
  readonly name = 'uploadthing' as const;
  private readonly logger = new Logger('UploadThing');

  constructor(private readonly client: UploadThingClient) {}

  static fromToken(token: string) {
    return new UploadThingStorage(new UTApi({ token }) as unknown as UploadThingClient);
  }

  async put(data: Buffer, opts: { name: string; mime: string; customId: string }): Promise<StoredFile> {
    const file = new UTFile([new Uint8Array(data)], opts.name, { type: opts.mime, customId: opts.customId });
    const res = await this.client.uploadFiles(file);
    if (res.error || !res.data) {
      this.logger.error(`Envoi refusé : ${res.error?.message}`);
      throw new Error("Le service de stockage des photos est indisponible. Réessayez dans un instant.");
    }
    return { key: res.data.key, url: res.data.ufsUrl };
  }

  async remove(keys: string[]): Promise<void> {
    const list = keys.filter(Boolean);
    if (list.length) await this.client.deleteFiles(list);
  }

  async list(): Promise<RemoteFile[]> {
    const out: RemoteFile[] = [];
    for (let offset = 0; offset < 50_000; offset += 500) {
      const page = await this.client.listFiles({ limit: 500, offset });
      out.push(...page.files);
      if (!page.hasMore) break;
    }
    return out;
  }
}
