import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from './units.service';
import { CatalogService } from '../catalog/catalog.service';
import { isValidImei } from '../../../common/imei';

const DB = 'zaff_tenant_test';
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné' };
const IMEI = '352902118889733';

describe('IMEI ≠ code-barres du modèle', () => {
  it('contrôle IMEI', () => {
    expect([isValidImei(IMEI), isValidImei('352902118889734'), isValidImei('6941764419893')]).toEqual([true, false, false]);
  });

  it('un IMEI ou un N° de série en stock est refusé comme code-barres ; une ancienne fiche fautive est réparée à la mise en stock', async () => {
    const conn = fakeTenantConnection({ ProductUnit: ['serialNumber'] });
    const notifications: any = { notify: async () => undefined, invalidate: () => undefined };
    const units = new UnitsService(conn as any, new SalesService(conn as any, notifications), notifications);
    const catalog = new CatalogService(conn as any);
    const base = { category: 'smartphones', salePrice: 110000, purchasePrice: 95000, hasSerialNumbers: true } as any;
    await expect(catalog.createProduct(DB, { ...base, name: 'iPhone 11', sku: 'IP11', barcode: IMEI })).rejects.toThrow(/IMEI/);
    const ok: any = await catalog.createProduct(DB, { ...base, name: 'iPhone 11', sku: 'IP11', barcode: '0190199220201' });
    expect(ok.barcode).toBe('0190199220201');

    // Fiche créée avant cette règle avec l'IMEI comme code-barres
    const legacy = await conn.getModel(DB, 'Product').create({ ...base, name: 'iPhone 11 Rouge', sku: 'IP11R', barcode: IMEI, stockQuantity: 0 });
    const r = await units.addUnits(DB, { productId: String(legacy._id), serialNumbers: [IMEI] }, keeper);
    expect(r.created).toHaveLength(1);
    const fixed = conn.models.Product.docs.find((d) => String(d._id) === String(legacy._id));
    expect([fixed.barcode, fixed.stockQuantity]).toEqual([null, 1]);
    await expect(catalog.updateProduct(DB, String(ok._id), { barcode: IMEI } as any)).rejects.toThrow(/déjà en stock/);
  });
});

describe('Vente confirmée par le scan', () => {
  it('trace la confirmation ; seul le propriétaire peut valider sans scan ; garantie liée au client', async () => {
    const conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    const notifications: any = { notify: async () => undefined, invalidate: () => undefined };
    const units = new UnitsService(conn as any, new SalesService(conn as any, notifications), notifications);
    const p = await conn.getModel(DB, 'Product').create({ name: 'iPhone 11', sku: 'IP11', category: 'smartphones', salePrice: 110000, purchasePrice: 95000, stockQuantity: 0, hasSerialNumbers: true });
    await units.addUnits(DB, { productId: String(p._id), serialNumbers: ['SN-V1', 'SN-V2'] }, keeper);
    const seller = { userId: new Types.ObjectId().toString(), name: 'Awa', role: 'seller' };
    const owner = { userId: new Types.ObjectId().toString(), name: 'Patron', role: 'admin' };
    await expect(units.sell(DB, { serialNumber: 'SN-V1', confirmation: 'owner_override' } as any, seller, 'CI')).rejects.toThrow(/Scannez l'appareil/);
    const r: any = await units.sell(DB, { serialNumber: 'SN-V1', confirmation: 'scan', customerName: 'Ali', customerPhone: '0701020304', warrantyMonths: 12 } as any, seller, 'CI');
    expect(conn.models.Sale.docs.find((d) => String(d._id) === String(r.sale._id)).confirmation).toBe('scan');
    expect(conn.models.Warranty.docs.filter((w) => w.serialNumber === 'SN-V1')).toHaveLength(1);
    const o: any = await units.sell(DB, { serialNumber: 'SN-V2', confirmation: 'manual' } as any, seller, 'CI');
    expect(o.sale.confirmation).toBe('manual');
    expect(owner.role).toBe('admin');
  });
});
