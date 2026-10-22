/**
 * Stock par modèle et capacité (à la manière d'un back-office de place de marché) : chaque famille
 * (catégorie + marque + nom) regroupe ses versions (capacité, couleur, état), avec ce qui est vendable,
 * ce qui est dehors (dépôt revendeur, atelier, défectueux), le rythme de vente et l'âge du stock.
 * Fonction pure : testée sans base.
 */
export interface StockModelInput {
  products: any[];
  /** Unités non vendues (in_stock, consigned, defective, in_repair) : productId, status, createdAt */
  units: Array<{ productId: any; status: string; createdAt?: Date | string | null }>;
  /** Quantités vendues sur la période, par produit */
  sold: Map<string, number>;
  periodDays: number;
  now?: Date;
  showCosts: boolean;
}

const DAY = 24 * 3600 * 1000;
/** Au-delà, un appareil « dort » en stock : à mettre en avant ou à solder */
export const AGING_DAYS = 60;

const norm = (s?: string | null) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** « 128 Go » < « 256 Go » < « 1 To » ; sinon ordre alphabétique */
export const capacityRank = (v?: string | null) => {
  const m = /(\d+(?:[.,]\d+)?)\s*(go|gb|to|tb)/i.exec(v || '');
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseFloat(m[1].replace(',', '.'));
  return /t/i.test(m[2]) ? n * 1024 : n;
};

export function buildStockModels(input: StockModelInput) {
  const now = (input.now || new Date()).getTime();
  const byProduct = new Map<string, { in_stock: number; consigned: number; defective: number; in_repair: number; ages: number[] }>();
  for (const u of input.units) {
    const id = String(u.productId);
    const b = byProduct.get(id) || { in_stock: 0, consigned: 0, defective: 0, in_repair: 0, ages: [] };
    if (u.status in b) (b as any)[u.status] += 1;
    if (u.status === 'in_stock' && u.createdAt) b.ages.push(Math.max(0, Math.floor((now - new Date(u.createdAt).getTime()) / DAY)));
    byProduct.set(id, b);
  }

  const families = new Map<string, any>();
  for (const p of input.products) {
    const id = String(p._id);
    const u = byProduct.get(id);
    const tracked = !!p.hasSerialNumbers;
    const inStock = tracked ? u?.in_stock ?? 0 : Math.max(0, p.stockQuantity || 0);
    const sold = input.sold.get(id) || 0;
    const perDay = sold / input.periodDays;
    const ages = u?.ages || [];
    const min = p.minStockAlert ?? 0;
    const version = {
      productId: id,
      sku: p.sku || null,
      capacity: p.model || null,
      color: p.color || null,
      condition: p.condition || 'new',
      imageId: p.imageId || null,
      tracked,
      inStock,
      consigned: u?.consigned ?? 0,
      defective: u?.defective ?? 0,
      inRepair: u?.in_repair ?? 0,
      sold,
      salePrice: p.salePrice || 0,
      resellerPrice: p.resellerPrice || 0,
      ...(input.showCosts ? { purchasePrice: p.purchasePrice || 0, value: inStock * (p.purchasePrice || 0) } : {}),
      saleValue: inStock * (p.salePrice || 0),
      minStockAlert: min,
      /** Jours de vente couverts par le stock au rythme actuel (null : rien vendu sur la période) */
      coverDays: perDay > 0 ? Math.round(inStock / perDay) : null,
      avgAgeDays: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
      oldestDays: ages.length ? Math.max(...ages) : null,
      agingUnits: ages.filter((a) => a >= AGING_DAYS).length,
      status: inStock === 0 ? 'out' : inStock <= min ? 'low' : 'ok',
      /** Quantité à recommander pour tenir 30 jours (au rythme de la période), 0 si rien ne se vend */
      reorder: perDay > 0 ? Math.max(0, Math.ceil(perDay * 30) - inStock) : inStock <= min && min > 0 ? Math.max(0, 2 * min - inStock) : 0,
    };

    const key = [norm(p.category), norm(p.brand), norm(p.name)].join('|');
    const f =
      families.get(key) ||
      {
        key,
        category: p.category || '',
        brand: p.brand || null,
        name: p.name,
        deviceId: p.deviceId || null,
        imageId: null as string | null,
        versions: [] as any[],
      };
    if (!f.imageId && p.imageId) f.imageId = p.imageId;
    if (!f.deviceId && p.deviceId) f.deviceId = p.deviceId;
    f.versions.push(version);
    families.set(key, f);
  }

  const list = [...families.values()].map((f) => {
    f.versions.sort(
      (a: any, b: any) =>
        capacityRank(a.capacity) - capacityRank(b.capacity) ||
        (a.capacity || '').localeCompare(b.capacity || '') ||
        (a.color || '').localeCompare(b.color || '') ||
        a.condition.localeCompare(b.condition),
    );
    const sum = (k: string) => f.versions.reduce((a: number, v: any) => a + (v[k] || 0), 0);
    // Résumé par capacité (sélecteur « stockage » : disponible / épuisé, prix à partir de)
    const caps = new Map<string, any>();
    for (const v of f.versions) {
      const c = caps.get(v.capacity || '') || { capacity: v.capacity, inStock: 0, sold: 0, fromPrice: null as number | null, colors: [] as string[] };
      c.inStock += v.inStock;
      c.sold += v.sold;
      if (v.inStock > 0 && v.salePrice > 0) c.fromPrice = c.fromPrice == null ? v.salePrice : Math.min(c.fromPrice, v.salePrice);
      if (v.color && !c.colors.includes(v.color)) c.colors.push(v.color);
      caps.set(v.capacity || '', c);
    }
    const ages = f.versions.filter((v: any) => v.oldestDays != null).map((v: any) => v.oldestDays);
    const inStock = sum('inStock');
    return {
      ...f,
      inStock,
      consigned: sum('consigned'),
      defective: sum('defective'),
      inRepair: sum('inRepair'),
      sold: sum('sold'),
      ...(input.showCosts ? { value: sum('value') } : {}),
      saleValue: sum('saleValue'),
      agingUnits: sum('agingUnits'),
      oldestDays: ages.length ? Math.max(...ages) : null,
      outVersions: f.versions.filter((v: any) => v.status === 'out').length,
      lowVersions: f.versions.filter((v: any) => v.status === 'low').length,
      reorder: sum('reorder'),
      capacities: [...caps.values()],
    };
  });
  list.sort((a, b) => a.category.localeCompare(b.category) || b.inStock - a.inStock || a.name.localeCompare(b.name));

  const total = (k: string) => list.reduce((a, f: any) => a + (f[k] || 0), 0);
  return {
    periodDays: input.periodDays,
    agingDays: AGING_DAYS,
    totals: {
      families: list.length,
      versions: list.reduce((a, f) => a + f.versions.length, 0),
      inStock: total('inStock'),
      consigned: total('consigned'),
      defective: total('defective'),
      inRepair: total('inRepair'),
      sold: total('sold'),
      ...(input.showCosts ? { value: total('value') } : {}),
      saleValue: total('saleValue'),
      agingUnits: total('agingUnits'),
      outVersions: total('outVersions'),
      lowVersions: total('lowVersions'),
    },
    families: list,
  };
}
