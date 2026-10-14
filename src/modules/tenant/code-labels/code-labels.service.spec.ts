import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { CodeLabelsService } from './code-labels.service';
import { formatCode, luhnDigit, parseCode, suggestPrefix } from './code-format';

const DB = 'zaff_tenant_test';
const owner = { userId: new Types.ObjectId().toString(), name: 'Patron', role: 'admin' };
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné', role: 'storekeeper' };

describe('Format des codes appareils', () => {
  it('préfixe + 7 chiffres + chiffre de contrôle ; une faute de frappe est détectée', () => {
    expect(formatCode('TEL', 1)).toBe(`TEL-0000001${luhnDigit('0000001')}`);
    const code = formatCode('PC', 4521);
    expect(parseCode(code)).toEqual({ prefix: 'PC', seq: 4521, valid: true });
    const typo = code.slice(0, -2) + String((Number(code.at(-2)) + 1) % 10) + code.at(-1);
    expect(parseCode(typo)!.valid).toBe(false);
    expect(parseCode('356789104523871')).toBeNull();
    expect([suggestPrefix('smartphones'), suggestPrefix('Ordinateurs portables'), suggestPrefix('Tablettes')]).toEqual(['TEL', 'PC', 'TAB']);
  });
});

describe('Génération des codes appareils par catégorie', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let service: CodeLabelsService;
  let units: UnitsService;
  let notified: any[];
  let phone: any;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'], CodeSeries: ['prefix'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    service = new CodeLabelsService(conn as any, notifications);
    units = new UnitsService(conn as any, new SalesService(conn as any, notifications), notifications);
    phone = await conn.getModel(DB, 'Product').create({ name: 'Itel A70', sku: 'A70', category: 'smartphones', salePrice: 60000, purchasePrice: 45000, stockQuantity: 0, hasSerialNumbers: true });
  });

  it('séries : préfixe unique, catégorie proposée, préfixe verrouillé après la 1re génération', async () => {
    expect((await service.listSeries(DB)).suggestions).toEqual([{ category: 'smartphones', prefix: 'TEL' }]);
    const tel: any = await service.createSeries(DB, 'smartphones', 'tel', owner);
    expect(tel.prefix).toBe('TEL');
    await expect(service.createSeries(DB, 'ordinateurs', 'TEL', owner)).rejects.toThrow(/déjà utilisé/);
    await service.generate(DB, String(tel._id), 2, undefined, keeper);
    await expect(service.updateSeries(DB, String(tel._id), 'smartphones', 'PHN')).rejects.toThrow(/ne peut plus changer/);
    await expect(service.deleteSeries(DB, String(tel._id))).rejects.toThrow(/traçabilité/);
  });

  it('codes toujours uniques, lots tracés, patron prévenu ; mise en stock : code juste accepté, faute ou code inventé refusés', async () => {
    const tel: any = await service.createSeries(DB, 'smartphones', 'TEL', owner);
    const [a, b]: any[] = await Promise.all([
      service.generate(DB, String(tel._id), 3, String(phone._id), keeper),
      service.generate(DB, String(tel._id), 3, undefined, owner),
    ]);
    const all = [...a.codes, ...b.codes];
    expect(new Set(all).size).toBe(6);
    expect([a.code, a.productName, a.createdByName]).toEqual([expect.stringMatching(/^LOT-\d+$/), 'Itel A70', 'Koné']);
    expect(notified.filter((n) => n.type === 'codes.generated')).toHaveLength(1); // le magasinier seulement

    const good = a.codes[0];
    const typo = good.slice(0, -1) + String((Number(good.at(-1)) + 1) % 10);
    const fake = formatCode('TEL', 999);
    const r = await units.addUnits(DB, { productId: String(phone._id), serialNumbers: [good, typo, fake] }, keeper);
    expect(r.created.map((u: any) => u.serialNumber)).toEqual([good]);
    expect(r.rejected.map((x) => x.reason)).toEqual([expect.stringMatching(/mal saisi/), expect.stringMatching(/jamais été généré/)]);

    const lot: any = await service.getBatch(DB, String(a._id));
    expect([lot.usedCount, lot.items[0]]).toEqual([1, expect.objectContaining({ code: good, used: true, status: 'in_stock', productName: 'Itel A70' })]);
    await service.markPrinted(DB, String(a._id), 'thermal', undefined, keeper);
    expect((await service.listBatches(DB)).find((x: any) => String(x._id) === String(a._id))).toMatchObject({ usedCount: 1, printCount: 1 });
  });

  it('un N° de série identique déjà saisi à la main est sauté : jamais de doublon', async () => {
    const tel: any = await service.createSeries(DB, 'smartphones', 'TEL', owner);
    await conn.getModel(DB, 'ProductUnit').create({ productId: phone._id, serialNumber: formatCode('TEL', 1), status: 'in_stock' });
    const lot: any = await service.generate(DB, String(tel._id), 2, undefined, owner);
    expect(lot.codes).toEqual([formatCode('TEL', 2), formatCode('TEL', 3)]);
  });
});
