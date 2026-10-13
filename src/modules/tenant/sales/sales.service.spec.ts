import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from './sales.service';
import { UnitsService } from '../units/units.service';
import { CustomersService } from '../customers/customers.service';
import { CashClosingsService } from '../cash-closings/cash-closings.service';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { SaleType } from '../../../common/enums/sale-type.enum';
import { UnitStatus } from '../../../common/enums/unit-status.enum';

const DB = 'zaff_tenant_test';
const owner = { userId: new Types.ObjectId().toString(), name: 'Patron', role: 'admin' };
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa', role: 'seller' };
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné' };

describe('Vente, revendeurs, crédit : règles appliquées par le serveur', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let sales: SalesService;
  let units: UnitsService;
  let customers: CustomersService;
  let closings: CashClosingsService;
  let phone: any;
  let cable: any;
  let reseller: any;

  const stock = (p: any) => conn.models.Product.docs.find((d) => String(d._id) === String(p._id)).stockQuantity;
  const line = (p: any, extra: Record<string, unknown> = {}) => ({ productId: String(p._id), productName: p.name, quantity: 1, ...extra }) as any;
  const sell = (dto: Record<string, unknown>, actor: any = seller) =>
    sales.create(DB, { paymentMethod: PaymentMethod.CASH, saleType: SaleType.PURCHASE, ...dto } as any, actor, { country: 'CI' });

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    const notifications: any = { notify: async () => undefined, invalidate: () => undefined };
    sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    customers = new CustomersService(conn as any, notifications);
    closings = new CashClosingsService(conn as any, notifications);
    const products = conn.getModel(DB, 'Product');
    phone = await products.create({ name: 'Galaxy A55', sku: 'A55', category: 'smartphones', salePrice: 250000, resellerPrice: 230000, purchasePrice: 200000, stockQuantity: 0, hasSerialNumbers: true });
    cable = await products.create({ name: 'Câble USB-C', sku: 'CAB', category: 'accessoires', salePrice: 5000, resellerPrice: 3500, purchasePrice: 2000, stockQuantity: 50, hasSerialNumbers: false });
    await units.addUnits(DB, { productId: String(phone._id), serialNumbers: ['IMEI0001', 'IMEI0002', 'IMEI0003'] }, keeper);
    reseller = await customers.create(DB, { name: 'Tech Revente', phone: '07 01 02 03 04', isReseller: true } as any, 'CI');
  });

  it('prix et totaux recalculés : le montant envoyé par l\'écran est ignoré', async () => {
    const sale: any = await sell({ items: [line(cable, { quantity: 3, unitPrice: undefined, total: 1 })], subtotal: 1, total: 1, discount: 1000 });
    expect([sale.items[0].unitPrice, sale.items[0].total, sale.subtotal, sale.discount, sale.total]).toEqual([5000, 15000, 15000, 1000, 14000]);
    await expect(sell({ items: [line(cable)], discount: 9000 })).rejects.toThrow(/La remise .* dépasse/);
    await expect(sell({ items: [line(cable, { quantity: 0 })] })).rejects.toThrow(/Quantité invalide/);
    expect(stock(cable)).toBe(47);
  });

  it('un vendeur ne vend pas à perte, le propriétaire peut', async () => {
    await expect(sell({ items: [line(phone, { serialNumber: 'IMEI0001', unitPrice: 150000 })] })).rejects.toThrow(/Prix trop bas/);
    await expect(sell({ items: [line(cable, { quantity: 10 })], discount: 40000 })).rejects.toThrow(/Remise trop forte/);
    expect(conn.models.ProductUnit.docs.find((u) => u.serialNumber === 'IMEI0001').status).toBe(UnitStatus.IN_STOCK);
    const sale: any = await sell({ items: [line(phone, { serialNumber: 'IMEI0001', unitPrice: 150000 })] }, owner);
    expect(sale.total).toBe(150000);
  });

  it('n° de facture uniques, à la suite des factures existantes, même en parallèle', async () => {
    await conn.getModel(DB, 'Sale').create({ invoiceNumber: 1500, items: [], total: 0 });
    const all: any[] = await Promise.all([1, 2, 3].map(() => sell({ items: [line(cable)] })));
    expect(all.map((s) => s.invoiceNumber).sort()).toEqual([1501, 1502, 1503]);
  });

  it('vente échouée après réservation : l\'appareil et le stock sont rendus', async () => {
    const saleModel = conn.getModel(DB, 'Sale');
    const original = saleModel.create.bind(saleModel);
    saleModel.create = async () => { throw new Error('panne base'); };
    await expect(sell({ items: [line(phone, { serialNumber: 'IMEI0002' })] })).rejects.toThrow('panne base');
    saleModel.create = original;
    expect(conn.models.ProductUnit.docs.find((u) => u.serialNumber === 'IMEI0002').status).toBe(UnitStatus.IN_STOCK);
    expect(stock(phone)).toBe(3);
  });

  it('tarif revendeur réservé aux revendeurs ; numéro du client au format international', async () => {
    expect(reseller.phone).toBe('+2250701020304');
    const walkIn = await customers.create(DB, { name: 'Client normal' } as any, 'CI');
    await expect(sell({ saleType: SaleType.RESELLER, items: [line(cable)] })).rejects.toThrow(/doit être faite à un revendeur/);
    await expect(sell({ saleType: SaleType.RESELLER, customerId: String(walkIn._id), items: [line(cable)] })).rejects.toThrow(/pas enregistré comme revendeur/);
    const sale: any = await sell({ saleType: SaleType.RESELLER, customerId: String(reseller._id), items: [line(cable, { quantity: 2 })] });
    expect(sale.total).toBe(7000);
    // Même client retrouvé, quelle que soit l'écriture du numéro
    const s2: any = await sell({ customerPhone: '0701020304', items: [line(cable)] });
    expect(String(s2.customerId)).toBe(String(reseller._id));
  });

  it('crédit revendeur : acompte, dette, paiements (ventes les plus anciennes d\'abord) et caisse du collaborateur', async () => {
    await expect(sell({ paymentMethod: PaymentMethod.CREDIT, items: [line(cable)] })).rejects.toThrow(/crédit doit être faite à un client/);
    const id = String(reseller._id);
    const s1: any = await sell({ paymentMethod: PaymentMethod.CREDIT, saleType: SaleType.RESELLER, customerId: id, depositAmount: 100000, depositMethod: 'cash', items: [line(phone, { serialNumber: 'IMEI0001' }), line(phone, { serialNumber: 'IMEI0002' })] });
    expect([s1.total, s1.depositAmount, s1.amountDue, s1.paymentStatus]).toEqual([460000, 100000, 360000, 'partial']);
    const s2: any = await sell({ paymentMethod: PaymentMethod.CREDIT, saleType: SaleType.RESELLER, customerId: id, items: [line(cable, { quantity: 10 })] });
    expect(s2.amountDue).toBe(35000);
    expect((await customers.findById(DB, id)).customer.balance).toBe(395000);
    await expect(sell({ paymentMethod: PaymentMethod.CREDIT, customerId: id, depositAmount: 999999, items: [line(cable)] })).rejects.toThrow(/L'acompte .* dépasse/);

    // Paiement : la plus ancienne vente est soldée d'abord ; pas plus que la dette
    await expect(customers.addPayment(DB, id, { amount: 500000 }, seller)).rejects.toThrow(/doit 395/);
    const pay = await customers.addPayment(DB, id, { amount: 370000, method: 'mobile' }, seller);
    expect(pay.balance).toBe(25000);
    expect(pay.payment.allocations.map((a: any) => [a.invoiceNumber, a.amount])).toEqual([[s1.invoiceNumber, 360000], [s2.invoiceNumber, 10000]]);
    const sales1 = conn.models.Sale.docs.find((d) => d.invoiceNumber === s1.invoiceNumber);
    expect([sales1.amountDue, sales1.paymentStatus]).toEqual([0, 'paid']);

    // Caisse d'Awa : acompte en espèces + paiement Mobile Money ; la dette n'est pas de l'argent à remettre
    const reg = await closings.current(DB, seller.userId);
    expect([reg.totals.cash, reg.totals.mobile, reg.totals.credit]).toEqual([100000, 370000, 395000]);
    expect(reg.collections).toEqual({ amount: 470000, count: 2 });
    const closing: any = await closings.close(DB, seller, { declaredCash: 100000 } as any);
    expect([closing.expectedCash, closing.cashDifference]).toEqual([100000, 0]);
    await expect(customers.remove(DB, id)).rejects.toThrow(/doit encore/);
  });

  it('retour de lot revendeur : contrôlé, une seule fois, la valeur réduit la dette', async () => {
    const id = String(reseller._id);
    const sale: any = await sell({ paymentMethod: PaymentMethod.CREDIT, saleType: SaleType.RESELLER, customerId: id, items: [line(phone, { serialNumber: 'IMEI0003' }), line(cable, { quantity: 10 })] });
    expect(sale.amountDue).toBe(265000);
    await expect(sales.returnItems(DB, String(sale._id), { items: [{ productId: String(phone._id), quantity: 1 }] } as any, owner)).rejects.toThrow(/N° de série/);
    await expect(sales.returnItems(DB, String(sale._id), { items: [{ productId: String(cable._id), quantity: 11 }] } as any, owner)).rejects.toThrow(/10 vendu/);

    const r = await sales.returnItems(DB, String(sale._id), { items: [{ productId: String(cable._id), quantity: 6 }, { productId: String(phone._id), quantity: 1, serialNumber: 'imei0003' }] } as any, owner);
    expect([r.value, r.debtReduction, r.refundDue]).toEqual([251000, 251000, 0]);
    expect(stock(cable)).toBe(46);
    expect(conn.models.ProductUnit.docs.find((u) => u.serialNumber === 'IMEI0003').status).toBe(UnitStatus.IN_STOCK);
    await expect(sales.returnItems(DB, String(sale._id), { items: [{ productId: String(cable._id), quantity: 5 }] } as any, owner)).rejects.toThrow(/6 déjà retourné/);
    await expect(sales.returnItems(DB, String(sale._id), { items: [{ productId: String(phone._id), quantity: 1, serialNumber: 'IMEI0003' }] } as any, owner)).rejects.toThrow(/déjà retourné/);
    expect((await customers.findById(DB, id)).customer.balance).toBe(14000);
    const doc = conn.models.Sale.docs.find((d) => d.invoiceNumber === sale.invoiceNumber);
    expect([doc.amountDue, doc.returnStatus, doc.returnedAmount]).toEqual([14000, 'partial', 251000]);

    // Vente payée comptant : la valeur retournée est remboursée et sort de la caisse du propriétaire
    const cash: any = await sell({ customerId: id, items: [line(cable, { quantity: 2 })] }, owner);
    const r2 = await sales.returnItems(DB, String(cash._id), { items: [{ productId: String(cable._id), quantity: 2 }], refundMethod: 'cash' } as any, owner);
    expect([r2.refundDue, r2.refunded]).toEqual([10000, 10000]);
    expect((await closings.current(DB, owner.userId)).totals.cash).toBe(0); // 10 000 encaissés − 10 000 remboursés
  });
});
