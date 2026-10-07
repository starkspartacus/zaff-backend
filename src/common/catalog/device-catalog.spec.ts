import { CATEGORY_PROFILES, DEVICE_MODELS } from './device-catalog';

describe('Catalogue des appareils connus', () => {
  it('chaque catégorie de modèles a un profil, sans doublon de modèle par marque', () => {
    for (const [cat, brands] of Object.entries(DEVICE_MODELS)) {
      expect(CATEGORY_PROFILES[cat]).toBeDefined();
      for (const [brand, models] of Object.entries(brands)) {
        const names = models.map((m) => m.name.toLowerCase());
        expect({ cat, brand, dup: names.length - new Set(names).size }).toEqual({ cat, brand, dup: 0 });
      }
    }
  });

  it('iPhone : capacités et coloris officiels', () => {
    const iphone = DEVICE_MODELS.smartphones.Apple.find((m) => m.name === 'iPhone 15 Pro')!;
    expect(iphone.variants).toContain('256 Go');
    expect(iphone.colors).toContain('Titane naturel');
  });
});
