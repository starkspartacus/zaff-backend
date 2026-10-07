import { toE164 } from '../geo/geo';

/** Normalise un numéro de téléphone (espaces, tirets, points, parenthèses, préfixe 00 → +) */
export const normalizePhone = (phone: string): string => {
  let cleaned = (phone || '').replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  return cleaned;
};

/**
 * Identifiant de connexion : e-mail en minuscules, ou téléphone au format international (+2250707070707).
 * Le pays donne l'indicatif quand le numéro est saisi sans « + » (07 07 07 07 07 + CI).
 */
export const normalizeIdentifier = (raw: string, countryCode?: string | null): string => {
  const value = (raw || '').trim();
  if (value.includes('@')) return value.toLowerCase();
  return toE164(value, countryCode) || normalizePhone(value);
};
