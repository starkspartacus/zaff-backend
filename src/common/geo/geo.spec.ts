import { getCountries } from 'libphonenumber-js/max';
import { COUNTRY_CURRENCY } from './currencies';
import { COUNTRIES, citiesOf, findCity, findCountry, toE164 } from './geo';

describe('Données géographiques', () => {
  it('chaque pays a un indicatif, un drapeau et une devise', () => {
    expect(COUNTRIES).toHaveLength(getCountries().length);
    for (const c of COUNTRIES) {
      expect(COUNTRY_CURRENCY[c.code]).toBeDefined();
      expect(c.dialCode).toMatch(/^\+\d+$/);
      expect(c.name).toBeTruthy();
    }
  });

  it("Côte d'Ivoire : +225, F CFA, villes en tête de liste avec les pays africains", () => {
    expect(findCountry('ci')).toMatchObject({ name: "Côte d'Ivoire", dialCode: '+225', flag: '🇨🇮', currency: { code: 'XOF', symbol: 'F CFA' } });
    expect(COUNTRIES[0].hasCities).toBe(true);
    expect(findCountry('NG')?.currency.symbol).toBe('₦');
    expect(findCountry('FR')?.currency.symbol).toBe('€');
  });

  it('Abidjan impose le choix de la commune', () => {
    const abidjan = findCity('CI', 'abidjan');
    expect(abidjan).toMatchObject({ communeRequired: true });
    expect(abidjan?.communes).toEqual(expect.arrayContaining(['Cocody', 'Yopougon', 'Plateau', 'Abobo']));
    expect(findCity('CI', 'Bouaké')?.communeRequired).toBeFalsy();
    expect(citiesOf('XK')).toEqual([]); // pays hors Afrique : ville en saisie libre
  });

  it('numéros : format international selon le pays, numéros invalides refusés', () => {
    expect(toE164('07 07 07 07 07', 'CI')).toBe('+2250707070707');
    expect(toE164('07070707', 'CI')).toBeNull(); // ancien format à 8 chiffres
    expect(toE164('77 123 45 67', 'SN')).toBe('+221771234567');
    expect(toE164('06 12 34 56 78', 'FR')).toBe('+33612345678');
    expect(toE164('+2250707070707')).toBe('+2250707070707');
    expect(toE164('123', 'CI')).toBeNull();
  });
});
