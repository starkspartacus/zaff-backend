/**
 * Codes appareils générés par la boutique (appareils livrés sans N° de série / code exploitable) :
 * PRÉFIXE-NNNNNNNC — 7 chiffres de numéro (séquence atomique par préfixe) + 1 chiffre de contrôle (Luhn)
 * qui détecte une faute de frappe ou deux chiffres inversés.
 */
export const SEQ_DIGITS = 7;
export const MAX_SEQ = 10 ** SEQ_DIGITS - 1;
export const CODE_RE = /^([A-Z]{2,5})-(\d{8})$/;
export const PREFIX_RE = /^[A-Z]{2,5}$/;

export function luhnDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function formatCode(prefix: string, seq: number): string {
  const body = String(seq).padStart(SEQ_DIGITS, '0');
  return `${prefix}-${body}${luhnDigit(body)}`;
}

/** null si ce n'est pas un code au format ZAFF ; sinon préfixe, numéro et validité du chiffre de contrôle */
export function parseCode(code: string): { prefix: string; seq: number; valid: boolean } | null {
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const body = m[2].slice(0, SEQ_DIGITS);
  return { prefix: m[1], seq: Number(body), valid: luhnDigit(body) === Number(m[2][SEQ_DIGITS]) };
}

/** Préfixe proposé pour une catégorie (modifiable par le patron) */
export function suggestPrefix(category: string): string {
  const c = category
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const known: Array<[RegExp, string]> = [
    // Les ordinateurs d'abord : « ordinateurs portables » ne doit pas devenir TEL
    [/ordinateur|laptop|\bpc\b|computer|notebook|macbook/, 'PC'],
    [/phone|portable|telephone|mobile|smartphone|cellulaire/, 'TEL'],
    [/tablet|tablette|ipad/, 'TAB'],
    [/montre|watch/, 'MTR'],
    [/ecouteur|casque|audio|airpod|headphone/, 'AUD'],
    [/console|jeu|gaming/, 'JEU'],
    [/tv|televi|ecran|moniteur/, 'TV'],
    [/imprimante|printer/, 'IMP'],
    [/accessoire/, 'ACC'],
  ];
  for (const [re, p] of known) if (re.test(c)) return p;
  const letters = c.replace(/[^a-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'APP').padEnd(2, 'X');
}
