import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { CITIES, CityDef } from './cities';
import { COUNTRY_CURRENCY, COUNTRY_NAME_OVERRIDES, CURRENCY_SYMBOL } from './currencies';

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  currency: { code: string; symbol: string; name: string };
  /** La boutique choisit sa ville dans une liste (sinon saisie libre) */
  hasCities: boolean;
  /** Exemple de numéro mobile, pour l'aide à la saisie */
  example: string | null;
}

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
const currencyNames = new Intl.DisplayNames(['fr'], { type: 'currency' });

const flagOf = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const symbolOf = (currency: string) => {
  if (CURRENCY_SYMBOL[currency]) return CURRENCY_SYMBOL[currency];
  try {
    const part = new Intl.NumberFormat('fr', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value || currency;
  } catch {
    return currency;
  }
};

const EXAMPLES: Partial<Record<string, string>> = { CI: '07 07 07 07 07', SN: '77 123 45 67', CM: '6 71 23 45 67', FR: '06 12 34 56 78' };

/** Liste complète des pays (calculée une fois) : Afrique en premier, puis ordre alphabétique */
export const COUNTRIES: CountryInfo[] = getCountries()
  .map((code) => {
    const currency = COUNTRY_CURRENCY[code] || 'USD';
    return {
      code,
      name: COUNTRY_NAME_OVERRIDES[code] || regionNames.of(code) || code,
      flag: flagOf(code),
      dialCode: `+${getCountryCallingCode(code as CountryCode)}`,
      currency: { code: currency, symbol: symbolOf(currency), name: currencyNames.of(currency) || currency },
      hasCities: !!CITIES[code],
      example: EXAMPLES[code] || null,
    };
  })
  .sort((a, b) => Number(b.hasCities) - Number(a.hasCities) || a.name.localeCompare(b.name, 'fr'));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const findCountry = (code?: string | null) => (code ? BY_CODE.get(code.toUpperCase()) : undefined);
export const citiesOf = (code: string): CityDef[] => CITIES[code.toUpperCase()] || [];
export const findCity = (country: string, city: string) =>
  citiesOf(country).find((c) => c.name.localeCompare(city, 'fr', { sensitivity: 'base' }) === 0);

/** Numéro saisi (avec le pays choisi) → format international E.164 (+2250707070707), ou null s'il est invalide */
export function toE164(phone: string, country?: string | null): string | null {
  const parsed = parsePhoneNumberFromString(phone || '', (country?.toUpperCase() as CountryCode) || undefined);
  return parsed && parsed.isValid() ? parsed.number : null;
}
