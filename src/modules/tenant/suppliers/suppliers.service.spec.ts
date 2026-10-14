import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { SuppliersService } from './suppliers.service';

const DB = 'zaff_tenant_test';
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné', role: 'storekeeper' };

describe('Commandes fournisseurs : bon, réception (partielle, par scan), paiement', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let service: SuppliersService;
  let notified: any[];
  let phone: any, cable: any, supplier: any;
  const product = (p: any) => conn.models.Product.docs.find((d) => String(d._id) === String(p._id));

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    const sales = new SalesService(conn as any, notifications);
    const units = new UnitsService(conn as any, sales, notifications);
    service = new SuppliersService(conn as any, units, notifications);
    phone = await conn.getModel(DB, 'Product').create({ name: 'iPhone 16', sku: 'IP16', category: 'smartphones', salePrice: 600000, purchasePrice: 450000, stockQuantity: 0, minStockAlert: 2, hasSerialNumbers: true });
    cable = await conn.getModel(DB, 'Product').create({ name: 'Câble USB-C', sku: 'USBC', category: 'accessoires', salePrice: 3000, purchasePrice: 1000, stockQuantity: 1, minStockAlert: 5, hasSerialNumbers: false });
    supplier = await service.createSupplier(DB, { name: 'Grossiste Tech', phone: '0701020304' }, 'CI');
  });

  const order = () =>
    service.createOrder(DB, { supplierId: String(supplier._id), items: [{ productId: String(phone._id), quantity: 2, unitPrice: 440000 }, { productId: String(cable._id), quantity: 10 }] }, keeper);

  it('bon BC- : prix du catalogue par défaut, totaux calculés par le serveur, téléphone E.164', async () => {
    const o: any = await order();
    expect([o.code, o.status, o.totalAmount, o.amountDue]).toEqual(['BC-1001', 'pending', 890000, 890000]);
    expect(o.items.find((i: any) => i.productName.startsWith('Câble')).unitPrice).toBe(1000);
    expect(supplier.phone).toBe('+2250701020304');
  });

  it('réception partielle par scan + quantité, puis complète ; doublons refusés ; prix d\'achat mis à jour', async () => {
    const o: any = await order();
    const r1: any = await service.receive(DB, o._id, { items: [{ productId: String(phone._id), serialNumbers: ['SN-0001', 'SN-0001'] }, { productId: String(cable._id), quantity: 4 }] }, keeper);
    expect(r1.received).toBe(5);
    expect(r1.results[0].rejected[0].reason).toMatch(/deux fois/);
    expect(r1.order.status).toBe('partial');
    expect([product(phone).stockQuantity, product(cable).stockQuantity, product(phone).purchasePrice]).toEqual([1, 5, 440000]);
    expect(notified.some((n) => n.type === 'purchase.received')).toBe(true);
    const r2: any = await service.receive(DB, o._id, { items: [{ productId: String(phone._id), serialNumbers: ['SN-0002'] }, { productId: String(cable._id), quantity: 6 }] }, keeper);
    expect([r2.order.status, r2.order.remaining, r2.order.receptions.length]).toEqual(['received', 0, 2]);
    await expect(service.receive(DB, o._id, { items: [{ productId: String(cable._id), quantity: 1 }] }, keeper)).rejects.toThrow(/entièrement reçue/);
  });

  it('solder une commande partielle ramène la dette au reçu ; paiement jamais au-delà du reste', async () => {
    const o: any = await order();
    await service.receive(DB, o._id, { items: [{ productId: String(cable._id), quantity: 10 }] }, keeper);
    const closed: any = await service.close(DB, o._id);
    expect([closed.status, closed.totalAmount, closed.amountDue]).toEqual(['received', 10000, 10000]);
    await expect(service.pay(DB, o._id, { amount: 20000 }, keeper)).rejects.toThrow(/dépasse/);
    const paid: any = await service.pay(DB, o._id, { amount: 10000, method: 'mobile_money' }, keeper);
    expect([paid.amountDue, paid.paidAmount, paid.payments.length]).toEqual([0, 10000, 1]);
    const [s] = await service.getSuppliers(DB);
    expect(s.amountDue).toBe(0);
  });

  it('annulation seulement si rien reçu ni payé ; suggestions tiennent compte du déjà commandé', async () => {
    const sug1 = await service.suggestions(DB);
    expect(sug1.map((s) => [s.productName, s.suggestedQty])).toEqual([['iPhone 16', 4], ['Câble USB-C', 9]]);
    const o: any = await order();
    const sug2 = await service.suggestions(DB);
    expect(sug2.map((s) => [s.productName, s.suggestedQty, s.lastSupplierName])).toEqual([['iPhone 16', 2, 'Grossiste Tech']]);
    expect((await service.cancel(DB, o._id) as any).status).toBe('cancelled');
  });

  it('ancienne commande (ancien module) : complétée puis réceptionnable et payable', async () => {
    const old = await conn.getModel(DB, 'PurchaseOrder').create({ supplierId: supplier._id, status: 'pending', totalAmount: 5000, items: [{ productId: cable._id, quantity: 5, unitPrice: 1000, total: 5000 }] });
    const list: any[] = await service.getOrders(DB);
    expect([list[0].amountDue, list[0].items[0].receivedQty, list[0].payments]).toEqual([5000, 0, []]);
    const r: any = await service.receive(DB, String(old._id), { items: [{ productId: String(cable._id), quantity: 5 }] }, keeper);
    expect([r.order.status, r.order.items[0].productName, r.order.supplierName]).toEqual(['received', 'Câble USB-C', 'Grossiste Tech']);
    expect((await service.pay(DB, String(old._id), { amount: 5000 }, keeper) as any).amountDue).toBe(0);
  });
});
