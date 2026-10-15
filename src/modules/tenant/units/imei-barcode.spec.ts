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
