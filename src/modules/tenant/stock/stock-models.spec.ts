import { buildStockModels, capacityRank } from './stock-models';

const now = new Date('2026-10-22T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);

describe('Stock par modèle et capacité', () => {
  const products = [
    { _id: 'a', category: 'smartphones', brand: 'Apple', name: 'iPhone 15', model: '256 Go', color: 'Noir', salePrice: 600000, purchasePrice: 500000, hasSerialNumbers: true, minStockAlert: 1 },
    { _id: 'b', category: 'smartphones', brand: 'Apple', name: 'iPhone 15', model: '128 Go', color: 'Noir', salePrice: 520000, purchasePrice: 430000, hasSerialNumbers: true, minStockAlert: 1 },
    { _id: 'c', category: 'smartphones', brand: 'Apple', name: 'iphone 15 ', model: '128 Go', color: 'Bleu', salePrice: 510000, purchasePrice: 430000, hasSerialNumbers: true, minStockAlert: 0 },
    { _id: 'd', category: 'accessoires', brand: null, name: 'Câble USB-C', salePrice: 5000, purchasePrice: 2000, hasSerialNumbers: false, stockQuantity: 12, minStockAlert: 5 },
  ];
  const units = [
    { productId: 'a', status: 'in_stock', createdAt: daysAgo(70) },
    { productId: 'a', status: 'in_stock', createdAt: daysAgo(10) },
    { productId: 'a', status: 'consigned', createdAt: daysAgo(5) },
    { productId: 'b', status: 'in_stock', createdAt: daysAgo(3) },
    { productId: 'b', status: 'defective', createdAt: daysAgo(3) },
  ];
  const sold = new Map([['b', 6], ['d', 30]]);

  it('regroupe les versions par famille, triées par capacité, avec les comptes', () => {
    const r = buildStockModels({ products, units, sold, periodDays: 30, now, showCosts: true });
    expect(r.families).toHaveLength(2);
    const iphone: any = r.families.find((f) => f.name === 'iPhone 15');
    expect(iphone.versions.map((v: any) => `${v.capacity} ${v.color}`)).toEqual(['128 Go Bleu', '128 Go Noir', '256 Go Noir']);
    expect(iphone.inStock).toBe(3);
    expect(iphone.consigned).toBe(1);
    expect(iphone.defective).toBe(1);
    expect(iphone.agingUnits).toBe(1);
    expect(iphone.oldestDays).toBe(70);
    expect(iphone.outVersions).toBe(1);
    expect(iphone.capacities).toEqual([
      { capacity: '128 Go', inStock: 1, sold: 6, fromPrice: 520000, colors: ['Bleu', 'Noir'] },
      { capacity: '256 Go', inStock: 2, sold: 0, fromPrice: 600000, colors: ['Noir'] },
    ]);
    const b = iphone.versions.find((v: any) => v.productId === 'b');
    expect(b.coverDays).toBe(5);
    expect(b.reorder).toBe(5);
    expect(b.status).toBe('low');
    expect(r.totals.value).toBe(2 * 500000 + 430000 + 12 * 2000);
  });

  it('accessoires : stock compté ; vendeurs : jamais de prix d’achat', () => {
    const r = buildStockModels({ products, units, sold, periodDays: 30, now, showCosts: false });
    const cable: any = r.families.find((f) => f.name === 'Câble USB-C');
    expect(cable.versions[0].inStock).toBe(12);
    expect(cable.versions[0].coverDays).toBe(12);
    expect(JSON.stringify(r)).not.toContain('purchasePrice');
    expect((r.totals as any).value).toBeUndefined();
  });

  it('ordonne les capacités Go puis To', () => {
    expect(['1 To', '64 Go', '512 Go'].sort((a, b) => capacityRank(a) - capacityRank(b))).toEqual(['64 Go', '512 Go', '1 To']);
  });
});
