import { webcrypto } from 'node:crypto';

/**
 * Node.js 18 et plus ancien n'exposent pas `globalThis.crypto` (Web Crypto) par défaut.
 * UploadThing signe chaque envoi avec `crypto.subtle` : sans lui, l'envoi échoue avec « Invalid signing secret »
 * alors que le jeton est bon. À importer en tout premier (main.ts).
 */
if (!(globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}

export const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
