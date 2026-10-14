import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { ConsignmentsService } from './consignments.service';
import { CashClosingsService } from '../cash-closings/cash-closings.service';
import { buildClosingReport } from '../cash-closings/closing-report';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

const DB = 'zaff_tenant_test';
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa', role: 'seller' };
const keeper = { userId: new Types.ObjectId().toString(), name: 'Koné' };

describe('Dépôt chez les revendeurs : remise, relances, vente ou retour', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let sales: SalesService;
  let units: UnitsService;
  let service: ConsignmentsService;
  let notified: any[];
  let phone: any;
  const unit = (sn: string) => conn.models.ProductUnit.docs.find((u) => u.serialNumber === sn);
  const stock = () => conn.models.Product.docs.find((d) => String(d._id) === String(phone._id)).stockQuantity;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], Counter: ['_id'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    service = new ConsignmentsService(conn as any, sales, notifications);
    phone = await conn.getModel(DB, 'Product').create({ name: 'iPhone 16 Pro Max', sku: 'IP16PM', category: 'smartphones', salePrice: 600000, resellerPrice: 500000, purchasePrice: 450000, stockQuantity: 0, hasSerialNumbers: true });
    await units.addUnits(DB, { productId: String(phone._id), serialNumbers: ['IMEI-A1', 'IMEI-A2', 'IMEI-A3'] }, keeper);
  });

  it('remise à un nouveau revendeur (pièce d\'identité facultative) : appareils hors stock, bon DR-, patron prévenu', async () => {
    const c: any = await service.create(DB, { customerName: 'Ali', customerPhone: '0701020304', idNumber: 'CI001', serialNumbers: ['imei-a1', 'IMEI-A2'] }, seller, 'CI');
    expect([c.code, c.outCount, c.outValue, c.days]).toEqual(['DR-1001', 2, 1000000, 3]);
    expect(Math.round((new Date(c.dueAt).getTime() - Date.now()) / 86400000)).toBe(3);
    const ali = conn.models.Customer.docs[0];
    expect([ali.name, ali.phone, ali.isReseller, ali.idNumber]).toEqual(['Ali', '+2250701020304', true, 'CI001']);
    expect([unit('IMEI-A1').status, unit('IMEI-A1').consignedToName]).toEqual([UnitStatus.CONSIGNED, 'Ali']);
    expect(stock()).toBe(1);
    expect(notified.some((n) => n.type === 'consignment.created' && /Awa a remis 2 appareils à Ali/.test(n.message))).toBe(true);
    expect(conn.models.StockMovement.docs.some((m) => /Remis au revendeur Ali \(bon DR-1001\)/.test(m.notes))).toBe(true);
    // Sans pièce d'identité : accepté
    const c2: any = await service.create(DB, { customerName: 'Moussa', serialNumbers: ['IMEI-A3'] }, seller, 'CI');
    expect(c2.code).toBe('DR-1002');
  });

  it('un appareil chez un revendeur ne se vend pas au comptoir, ne repart pas chez un autre, ne se supprime pas', async () => {
    await service.create(DB, { customerName: 'Ali', serialNumbers: ['IMEI-A1'] }, seller, 'CI');
    await expect(units.sell(DB, { serialNumber: 'IMEI-A1' } as any, seller)).rejects.toThrow(/chez le revendeur Ali/);
    await expect(service.create(DB, { customerName: 'Moussa', serialNumbers: ['IMEI-A1'] }, seller, 'CI')).rejects.toThrow(/déjà chez le revendeur Ali/);
    await expect(units.remove(DB, String(unit('IMEI-A1')._id))).rejects.toThrow(/chez un revendeur/);
    await expect(units.updateStatus(DB, String(unit('IMEI-A1')._id), { status: UnitStatus.DEFECTIVE } as any)).rejects.toThrow(/chez le revendeur/);
    // Remise impossible d'un appareil inconnu : rien n'est réservé
    await expect(service.create(DB, { customerName: 'Moussa', serialNumbers: ['IMEI-A2', 'INCONNU9'] }, seller, 'CI')).rejects.toThrow(/INCONNU9/);
    expect(unit('IMEI-A2').status).toBe(UnitStatus.IN_STOCK);
    expect(stock()).toBe(2);
  });

  it('retour du revendeur : vendus (facture au prix convenu, dans la caisse) et rendus (remis en stock, lien cassé)', async () => {
    const c: any = await service.create(DB, { customerName: 'Ali', serialNumbers: ['IMEI-A1', 'IMEI-A2'], prices: { 'IMEI-A1': 520000 } }, seller, 'CI');
    const r: any = await service.settle(DB, c.id, { sold: ['imei-a1'], returned: ['IMEI-A2'], paymentMethod: PaymentMethod.CASH }, seller, 'CI');
    expect([r.sale.total, r.sale.saleType, r.sale.invoiceNumber]).toEqual([520000, 'reseller', 1001]);
    expect([unit('IMEI-A1').status, unit('IMEI-A1').invoiceNumber]).toEqual([UnitStatus.SOLD, 1001]);
    expect([unit('IMEI-A2').status, unit('IMEI-A2').consignmentId]).toEqual([UnitStatus.IN_STOCK, null]);
    expect(stock()).toBe(2); // 3 − 2 remis + 1 rendu (le vendu était déjà sorti)
    expect(r.consignment.status).toBe('closed');
    expect(r.consignment.items.map((i: any) => [i.serialNumber, i.status, i.closedByName])).toEqual([['IMEI-A1', 'sold', 'Awa'], ['IMEI-A2', 'returned', 'Awa']]);
    expect(conn.models.StockMovement.docs.some((m) => /Rendu par le revendeur Ali, remis en stock/.test(m.notes))).toBe(true);
    const closings = new CashClosingsService(conn as any, { notify: async () => undefined, invalidate: () => undefined } as any);
    expect((await closings.current(DB, seller.userId)).totals.cash).toBe(520000);
    await expect(service.settle(DB, c.id, { returned: ['IMEI-A1'] }, seller, 'CI')).rejects.toThrow(/déjà été vendu/);
  });

  it('vendu à crédit par le revendeur : sa dette est suivie', async () => {
    const c: any = await service.create(DB, { customerName: 'Ali', serialNumbers: ['IMEI-A1'] }, seller, 'CI');
    await service.settle(DB, c.id, { sold: ['IMEI-A1'], paymentMethod: PaymentMethod.CREDIT, depositAmount: 200000, depositMethod: 'cash' }, seller, 'CI');
    expect(conn.models.Customer.docs[0].balance).toBe(300000);
  });

  it('relances : bon en retard rappelé au patron et au vendeur, une fois par jour ; résumé', async () => {
    const c: any = await service.create(DB, { customerName: 'Ali', serialNumbers: ['IMEI-A1', 'IMEI-A2'] }, seller, 'CI');
    expect(await service.remindOverdue(DB)).toBe(0); // pas encore en retard
    const in4days = new Date(Date.now() + 4 * 86400000);
    expect(await service.remindOverdue(DB, in4days)).toBe(1);
    const n = notified.find((x) => x.type === 'consignment.overdue');
    expect(n.message).toMatch(/2 appareils chez Ali depuis 4 jours.*pas encore de nouvelles/);
    expect(n.userIds).toEqual([seller.userId]);
    expect(await service.remindOverdue(DB, new Date(in4days.getTime() + 3600000))).toBe(0); // déjà relancé aujourd'hui
    expect(await service.remindOverdue(DB, new Date(in4days.getTime() + 86400000))).toBe(1);
    const s = await service.summary(DB);
    expect([s.units, s.value, s.resellers]).toEqual([2, 1000000, 1]);
    expect(((await service.findBySerial(DB, 'imei-a2')) as any).code).toBe(c.code);
  });

  it('rapport de clôture : texte WhatsApp et HTML avec totaux, écart et revendeurs', () => {
    const r = buildClosingReport({
      shopName: 'Boutique Test',
      currency: 'F CFA',
      closing: { code: 'CL-ABC123', sellerName: 'Awa', openedAt: new Date(), closedAt: new Date(), salesCount: 2, itemsCount: 2, totals: { cash: 850000, mobile: 10000, card: 0, bank_transfer: 0, credit: 0 }, totalAmount: 860000, expectedCash: 850000, declaredCash: 845000, cashDifference: -5000, notes: '<b>Monnaie</b>' },
      sales: [{ invoiceNumber: 1001, total: 850000, paymentMethod: 'cash', saleDate: new Date(), items: [{ productName: 'iPhone 15 Pro', quantity: 1, serialNumber: 'IMEI0001' }] }],
      consignments: { units: 2, value: 1000000, overdueUnits: 1, resellers: 1 },
    });
    expect(r.subject).toMatch(/Clôture de caisse — Awa — .* — Boutique Test/);
    expect(r.text).toMatch(/Espèces : 850 000 F CFA/);
    expect(r.text).toMatch(/Il manque 5 000 F CFA/);
    expect(r.text).toMatch(/Chez les revendeurs : 2 appareils .*dont 1 en retard/);
    expect(r.text).toMatch(/#1001 .*iPhone 15 Pro \(IMEI0001\)/);
    expect(r.html).toContain('&lt;b&gt;Monnaie&lt;/b&gt;'); // texte du vendeur échappé
  });

  it('clôture : rapport envoyé par e-mail au patron automatiquement', async () => {
    await conn.getModel(DB, 'TenantUser').create({ name: 'Patron', role: 'admin', email: 'patron@boutique.ci', phone: '+2250700000001' });
    const sent: any[] = [];
    const mail: any = { enabled: true, send: async (m: any) => (sent.push(m), true) };
    const closings = new CashClosingsService(conn as any, { notify: async () => undefined, invalidate: () => undefined } as any, mail);
    await units.sell(DB, { serialNumber: 'IMEI-A3' } as any, seller);
    const closing: any = await closings.close(DB, seller, { declaredCash: 600000 } as any, { name: 'Boutique Test', currency: 'F CFA' });
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['patron@boutique.ci']);
    expect(sent[0].subject).toMatch(/Clôture de caisse — Awa/);
    expect(sent[0].html).toContain('Caisse juste');
    const report = await closings.report(DB, String(closing._id), { userId: seller.userId, role: 'seller' }, { name: 'Boutique Test' });
    expect([report.ownerPhone, report.emailedTo]).toEqual(['+2250700000001', ['patron@boutique.ci']]);
    await expect(closings.report(DB, String(closing._id), { userId: keeper.userId, role: 'seller' })).rejects.toThrow(/introuvable/);
  });
});
