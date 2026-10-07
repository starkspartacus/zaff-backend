/** Normalise un numéro de téléphone (espaces, tirets, points, parenthèses, préfixe 00 → +) */
export const normalizePhone = (phone: string): string => {
  let cleaned = (phone || '').replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  return cleaned;
};

/** Identifiant de connexion : e-mail en minuscules ou téléphone normalisé */
export const normalizeIdentifier = (raw: string): string => {
  const value = (raw || '').trim();
  return value.includes('@') ? value.toLowerCase() : normalizePhone(value);
};
