import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { StockCountsService } from './stock-counts.service';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

const DB = 'zaff_tenant_test';
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné', role: 'storekeeper' };
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa', role: 'seller' };

describe('Inventaire par scan', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let service: StockCountsService;
  let sales: SalesService;
  let notified: any[];
  let phone: any, cable: any;
  const stockOf = (p: any) => conn.models.Product.docs.find((d) => String(d._id) === String(p._id)).stockQuantity;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    sales = new SalesService(conn as any, notifications);
    const units = new UnitsService(conn as any, sales, notifications);
    service = new StockCountsService(conn as any, notifications);
    phone = await conn.getModel(DB, 'Product').create({ name: 'iPhone 16', sku: 'IP16', category: 'smartphones', salePrice: 600000, purchasePrice: 450000, stockQuantity: 0, hasSerialNumbers: true });
    cable = await conn.getModel(DB, 'Product').create({ name: 'Câble USB-C', sku: 'USBC', barcode: '6001', category: 'accessoires', salePrice: 3000, purchasePrice: 1000, stockQuantity: 10, hasSerialNumbers: false });
    await units.addUnits(DB, { productId: String(phone._id), serialNumbers: ['SN-0001', 'SN-0002', 'SN-0003'] }, keeper);
  });

  it('un seul inventaire à la fois ; scans : trouvé, déjà compté, boîte, inconnu ; avancement en direct', async () => {
    const c: any = await service.start(DB, null, keeper);
    expect(c.code).toBe('INV-1');
    await expect(service.start(DB, null, keeper)).rejects.toThrow(/déjà en cours/);
    expect((await service.scan(DB, c._id, 'sn-0001', seller)).result).toBe('found');
    expect((await service.scan(DB, c._id, 'SN-0001', keeper)).result).toBe('already');
    expect((await service.scan(DB, c._id, 'IP16', seller)).kind).toBe('box');
    expect((await service.scan(DB, c._id, 'ZZZ999', seller)).kind).toBe('unknown');
    expect((await service.scan(DB, c._id, '6001', seller) as any).counted).toBe(1);
    const cur: any = await service.current(DB);
    expect([cur.progress.expectedUnits, cur.progress.foundUnits, cur.progress.plain[0].counted, cur.scannedBy]).toEqual([3, 1, 1, ['Awa']]);
  });

  it('clôture : manquants, inattendus, vendu pendant le comptage, stock des accessoires corrigé sans fausser les ventes', async () => {
    const sold = await sales.create(DB, { items: [{ productId: String(phone._id), quantity: 1, serialNumber: 'SN-0003' }], paymentMethod: PaymentMethod.CASH } as any, seller);
    expect(sold).toBeTruthy();
    const c: any = await service.start(DB, null, keeper);
    await service.scan(DB, c._id, 'SN-0001', seller);
    await service.scan(DB, c._id, 'SN-0003', seller); // vendu avant l'inventaire mais encore en boutique ?
    await service.count(DB, c._id, String(cable._id), 7, seller);
    // vente de 2 câbles pendant le comptage : stock 10 → 8
    await conn.getModel(DB, 'Product').updateOne({ _id: cable._id }, { $inc: { stockQuantity: -2 } });
    const closed: any = await service.close(DB, c._id, true, keeper);
    const r = closed.report;
    expect(r.missing.map((m: any) => m.serialNumber)).toEqual(['SN-0002']);
    expect(r.missingValue).toBe(450000);
    expect(r.unexpected[0].reason).toMatch(/vendu/);
    expect(r.plain[0]).toMatchObject({ expected: 10, counted: 7, difference: -3, applied: true });
    expect(stockOf(cable)).toBe(5);
    expect(notified.find((n) => n.type === 'stock.count.closed').level).toBe('warning');
    await expect(service.scan(DB, c._id, 'SN-0002', seller)).rejects.toThrow(/terminé/);
    await expect(service.close(DB, c._id, true, keeper)).rejects.toThrow(/déjà terminé/);
  });

  it('inventaire d\'une catégorie : les autres articles sont signalés, pas comptés ; produit non compté laissé tel quel', async () => {
    const c: any = await service.start(DB, 'accessoires', keeper);
    expect((await service.scan(DB, c._id, 'SN-0001', seller)).result).toBe('other_category');
    const closed: any = await service.close(DB, c._id, true, keeper);
    expect([closed.report.expectedUnits, closed.report.notCounted, stockOf(cable)]).toEqual([0, 1, 10]);
  });
});
