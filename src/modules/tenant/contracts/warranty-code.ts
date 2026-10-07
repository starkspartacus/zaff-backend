import { createHmac, timingSafeEqual } from 'crypto';
import { Types } from 'mongoose';

/**
 * Code imprimé dans le QR de la fiche de garantie : boutique + vente + ligne, signé (HMAC).
 * Infalsifiable sans le secret du serveur, et sans aucune donnée personnelle du client.
 * Format : base64url(12 o boutique · 12 o vente · 1 o ligne) « . » base64url(16 o de signature).
 */
export class WarrantyCodes {
  private readonly key: Buffer;

  constructor(secret: string) {
    // Clé dédiée, dérivée du secret de l'application (jamais le secret JWT lui-même)
    this.key = createHmac('sha256', secret).update('zaff-warranty-qr-v1').digest();
  }

  private sign(payload: Buffer) {
    return createHmac('sha256', this.key).update(payload).digest().subarray(0, 16);
  }

  encode(establishmentId: unknown, saleId: unknown, line: number): string {
    const payload = Buffer.concat([
      Buffer.from(String(establishmentId), 'hex'),
      Buffer.from(String(saleId), 'hex'),
      Buffer.from([line & 0xff]),
    ]);
    return `${payload.toString('base64url')}.${this.sign(payload).toString('base64url')}`;
  }

  decode(code: string): { establishmentId: string; saleId: string; line: number } | null {
    const [p, s] = String(code || '').split('.');
    if (!p || !s || p.length > 64 || s.length > 32) return null;
    const payload = Buffer.from(p, 'base64url');
    const sig = Buffer.from(s, 'base64url');
    if (payload.length !== 25 || sig.length !== 16) return null;
    if (!timingSafeEqual(sig, this.sign(payload))) return null;
    const establishmentId = payload.subarray(0, 12).toString('hex');
    const saleId = payload.subarray(12, 24).toString('hex');
    if (!Types.ObjectId.isValid(establishmentId) || !Types.ObjectId.isValid(saleId)) return null;
    return { establishmentId, saleId, line: payload[24] };
  }
}

export const WARRANTY_CODES = 'WARRANTY_CODES';
