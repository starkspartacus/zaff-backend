import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from './units.service';
import { UnitStatus } from '../../../common/enums/unit-status.enum';

const DB = 'zaff_tenant_test';
const storekeeper = { userId: new Types.ObjectId().toString(), name: 'Koné (magasinier)' };
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa (vendeuse)' };

describe('Unités à N° de série : mise en stock et vente par scan', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let sales: SalesService;
  let units: UnitsService;
  let iphone: any;
  let notified: any[];
  let invalidated: string[][];
  let cable: any;

  const stockOf = (p: any) => conn.models.Product.docs.find((d) => d._id === p._id).stockQuantity;
  const unit = (serial: string) => conn.models.ProductUnit.docs.find((d) => d.serialNumber === serial);

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'] });
    notified = [];
    invalidated = [];
    const notifications: any = {
      notify: async (_db: string, n: any) => notified.push(n),
      invalidate: (_db: string, scopes: string[]) => invalidated.push(scopes),
    };
    sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    const products = conn.getModel(DB, 'Product');
    iphone = await products.create({
      name: 'iPhone 15 Pro', sku: 'IPH15P', category: 'smartphones', barcode: '0194253401230',
      color: 'Titane naturel', salePrice: 850000, purchasePrice: 700000, stockQuantity: 0, hasSerialNumbers: true,
    });
    cable = await products.create({
      name: 'Câble USB-C', sku: 'CAB-C', category: 'accessoires', salePrice: 5000, stockQuantity: 0, hasSerialNumbers: false,
    });
  });

  it('met en stock les N° scannés et refuse les doublons', async () => {
    const res = await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['3567 8910 4523 871', 'f2lxk9abcd12', '356789104523871'] }, storekeeper);

    expect(res.created.map((u) => u.serialNumber)).toEqual(['356789104523871', 'F2LXK9ABCD12']);
    expect(res.rejected).toEqual([{ serialNumber: '356789104523871', reason: 'Scanné deux fois dans ce lot.' }]);
    expect(stockOf(iphone)).toBe(2);
    expect(unit('F2LXK9ABCD12').addedByName).toBe(storekeeper.name);

    const again = await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['F2LXK9ABCD12'] }, storekeeper);
    expect(again.created).toHaveLength(0);
    expect(again.rejected[0].reason).toContain('Déjà en stock');
    expect(stockOf(iphone)).toBe(2);
  });

  it('refuse la mise en stock par N° de série sur un produit non suivi', async () => {
    await expect(units.addUnits(DB, { productId: String(cable._id), serialNumbers: ['ABCD1234'] }, storekeeper)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vend un appareil scanné : facture, vendeur, stock et unité mis à jour', async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001', 'IMEI0002'] }, storekeeper);

    const { sale, unit: sold } = await units.sell(DB, { serialNumber: 'imei0001' }, seller);

    expect(sale.invoiceNumber).toBe(1001);
    expect(sale.total).toBe(850000);
    expect(sale.sellerName).toBe(seller.name);
    expect(sale.items[0].serialNumber).toBe('IMEI0001');
    expect(sold!.status).toBe(UnitStatus.SOLD);
    expect(sold!.soldByName).toBe(seller.name);
    expect(sold!.invoiceNumber).toBe(1001);
    expect(stockOf(iphone)).toBe(1);
  });

  it("ne vend jamais deux fois le même appareil", async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);
    await units.sell(DB, { serialNumber: 'IMEI0001' }, seller);

    await expect(units.sell(DB, { serialNumber: 'IMEI0001' }, seller)).rejects.toThrow('déjà été vendu (facture #1001)');
    expect(stockOf(iphone)).toBe(0);
    expect(conn.models.Sale.docs).toHaveLength(1);
  });

  it("exige le N° de série pour vendre un produit suivi depuis la caisse", async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);
    const dto: any = {
      items: [{ productId: String(iphone._id), productName: iphone.name, quantity: 1, unitPrice: 850000, total: 850000 }],
      subtotal: 850000, total: 850000, paymentMethod: 'cash', saleType: 'purchase',
    };
    await expect(sales.create(DB, dto, seller)).rejects.toThrow('Scannez le N° de série');
  });

  it("annule la réservation de l'appareil si une autre ligne du panier échoue", async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);
    const dto: any = {
      items: [
        { productId: String(iphone._id), productName: iphone.name, quantity: 1, unitPrice: 850000, total: 850000, serialNumber: 'IMEI0001' },
        { productId: String(cable._id), productName: cable.name, quantity: 3, unitPrice: 5000, total: 15000 },
      ],
      subtotal: 865000, total: 865000, paymentMethod: 'cash', saleType: 'purchase',
    };

    await expect(sales.create(DB, dto, seller)).rejects.toThrow('Stock insuffisant');
    expect(unit('IMEI0001').status).toBe(UnitStatus.IN_STOCK);
    expect(unit('IMEI0001').soldByName).toBeNull();
    expect(stockOf(iphone)).toBe(1);
    expect(conn.models.Sale?.docs ?? []).toHaveLength(0);
  });

  it('résout un code scanné : N° de série, code-barres du modèle, ou inconnu', async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);

    const byUnit = await units.lookup(DB, ' imei0001 ');
    expect(byUnit.type).toBe('unit');
    expect(byUnit.type === 'unit' && byUnit.sellable).toBe(true);

    const byModel = await units.lookup(DB, '0194253401230');
    expect(byModel).toMatchObject({ type: 'product', availableUnits: 1 });

    await expect(units.lookup(DB, 'XXXX')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un retour remet l\'appareil en vente', async () => {
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI0001' }, seller);

    await sales.returnItems(DB, String(sale._id), { items: [{ productId: String(iphone._id), quantity: 1, serialNumber: 'IMEI0001' }] });

    expect(unit('IMEI0001').status).toBe(UnitStatus.IN_STOCK);
    expect(unit('IMEI0001').saleId).toBeNull();
    expect(stockOf(iphone)).toBe(1);
  });

  it('un appareil mis de côté (défectueux) sort du stock vendable', async () => {
    const { created } = await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);

    await units.updateStatus(DB, String((created[0] as any)._id), { status: UnitStatus.DEFECTIVE, notes: 'Écran rayé' });
    expect(stockOf(iphone)).toBe(0);
    await expect(units.sell(DB, { serialNumber: 'IMEI0001' }, seller)).rejects.toThrow("n'est pas disponible à la vente");
  });

  it('notifie le propriétaire de la mise en stock et de la vente, et alerte en cas de rupture', async () => {
    iphone.minStockAlert = 0;
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI0001'] }, storekeeper);
    expect(notified[0]).toMatchObject({ type: 'units.added', roles: ['admin'], data: { count: 1 } });

    await units.sell(DB, { serialNumber: 'IMEI0001' }, seller);
    const sale = notified.find((n) => n.type === 'sale.created');
    expect(sale).toMatchObject({ roles: ['admin'], data: { invoiceNumber: 1001, amount: 850000, sellerName: seller.name } });
    expect(sale.message).toContain('Awa (vendeuse) a vendu iPhone 15 Pro');

    const low = notified.find((n) => n.type === 'stock.low');
    expect(low).toMatchObject({ title: 'Rupture de stock', roles: ['admin', 'storekeeper'], level: 'error' });
    expect(invalidated.at(-1)).toEqual(expect.arrayContaining(['sales', 'units', 'products', 'dashboard', 'my-stats']));
  });

  it("n'envoie aucune notification quand la vente échoue", async () => {
    await expect(units.sell(DB, { serialNumber: 'INCONNU' }, seller)).rejects.toBeInstanceOf(NotFoundException);
    expect(notified).toHaveLength(0);
  });
});
