import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../../testing/fake-model';
import { SalesService } from '../../sales/sales.service';
import { UnitsService } from '../units.service';
import { ReceptionsService } from './receptions.service';
import { CatalogService } from '../../catalog/catalog.service';
import { SuppliersService } from '../../suppliers/suppliers.service';

const DB = 'zaff_tenant_test';
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné', role: 'storekeeper' };

describe('Réceptions de marchandise et variantes de modèle', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let receptions: ReceptionsService;
  let catalog: CatalogService;
  let notified: any[];
  let ip64: any;
  const stock = (id: any) => conn.models.Product.docs.find((d) => String(d._id) === String(id)).stockQuantity;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    const units = new UnitsService(conn as any, new SalesService(conn as any, notifications), notifications);
    receptions = new ReceptionsService(conn as any, units, notifications);
    catalog = new CatalogService(conn as any);
    await conn.getModel(DB, 'Category').create({ name: 'Téléphones', slug: 'smartphones' });
    await conn.getModel(DB, 'Category').create({ name: 'Tablettes', slug: 'tablettes' });
    ip64 = await catalog.createProduct(DB, { name: 'iPhone 11', sku: 'IP11', category: 'smartphones', brand: 'Apple', model: '64 Go', color: 'Rouge', purchasePrice: 95000, salePrice: 110000, hasSerialNumbers: true } as any);
  });

  it('variante : autre capacité = fiche et stock séparés, mêmes prix ; la même variante n\'est jamais créée deux fois', async () => {
    const v1: any = await catalog.createVariant(DB, String(ip64._id), { model: '128 Go' });
    expect(v1.created).toBe(true);
    expect([v1.product.name, v1.product.model, v1.product.color, v1.product.salePrice, v1.product.stockQuantity]).toEqual(['iPhone 11', '128 Go', 'Rouge', 110000, 0]);
    expect(v1.product.sku).not.toBe(ip64.sku);
    const again: any = await catalog.createVariant(DB, String(ip64._id), { model: '128 go', color: 'rouge' });
    expect([again.created, String(again.product._id)]).toEqual([false, String(v1.product._id)]);
  });

  it('une réception REC- : par catégorie → modèle, N° de série, valeur ; refusés gardés ; une seule notification', async () => {
    const v128: any = (await catalog.createVariant(DB, String(ip64._id), { model: '128 Go' })).product;
    const tab: any = await catalog.createProduct(DB, { name: 'iPad 10', sku: 'IPAD10', category: 'tablettes', brand: 'Apple', purchasePrice: 200000, salePrice: 250000, hasSerialNumbers: true } as any);
    const r: any = await receptions.receiveScanned(
      DB,
      [
        { productId: String(ip64._id), serialNumbers: ['SN-A1', 'SN-A2'] },
        { productId: String(v128._id), serialNumbers: ['SN-B1', 'SN-A1'] },
        { productId: String(tab._id), serialNumbers: ['SN-T1'] },
      ],
      { note: 'Grossiste Adjamé' },
      keeper,
    );
    const rec = r.reception;
    expect([rec.code, rec.totalUnits, rec.totalValue, rec.receivedByName]).toEqual(['REC-1', 4, 95000 * 3 + 200000, 'Koné']);
    expect(rec.byCategory).toEqual([
      { category: 'smartphones', categoryName: 'Téléphones', quantity: 3 },
      { category: 'tablettes', categoryName: 'Tablettes', quantity: 1 },
    ]);
    expect(rec.lines.map((l: any) => [l.categoryName, l.productName, l.quantity])).toEqual([
      ['Tablettes', 'iPad 10', 1],
      ['Téléphones', 'iPhone 11 · 128 Go · Rouge', 1],
      ['Téléphones', 'iPhone 11 · 64 Go · Rouge', 2],
    ]);
    expect(rec.rejected).toHaveLength(1);
    expect([stock(ip64._id), stock(v128._id), stock(tab._id)]).toEqual([2, 1, 1]);
    expect(notified.map((n) => n.type)).toEqual(['stock.received']);
    expect(notified[0].message).toMatch(/Téléphones 3, Tablettes 1/);
    const list: any[] = await receptions.list(DB, {});
    expect([list.length, list[0].modelsCount]).toEqual([1, 3]);
  });

  it('la réception d\'une commande fournisseur apparaît dans le journal des réceptions', async () => {
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    const units = new UnitsService(conn as any, new SalesService(conn as any, notifications), notifications);
    const suppliers = new SuppliersService(conn as any, units, notifications, receptions);
    const sup: any = await suppliers.createSupplier(DB, { name: 'Grossiste Tech' }, 'CI');
    const order: any = await suppliers.createOrder(DB, { supplierId: String(sup._id), items: [{ productId: String(ip64._id), quantity: 2, unitPrice: 90000 }] }, keeper);
    await suppliers.receive(DB, order._id, { items: [{ productId: String(ip64._id), serialNumbers: ['SN-P1', 'SN-P2'] }] }, keeper);
    const [rec]: any[] = await receptions.list(DB, {});
    expect([rec.source, rec.orderCode, rec.supplierName, rec.totalUnits, rec.totalValue]).toEqual(['purchase_order', order.code, 'Grossiste Tech', 2, 180000]);
  });
});
