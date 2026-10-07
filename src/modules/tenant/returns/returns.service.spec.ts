import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from '../units/units.service';
import { RepairsService } from '../repairs/repairs.service';
import { CashClosingsService } from '../cash-closings/cash-closings.service';
import { DEFAULT_RETURN_POLICY, resolveReturnPolicy, ReturnPolicy } from '../settings/return-policy';
import { evaluateReturn } from './return-rules';
import { ReturnsService } from './returns.service';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { RepairStatus } from '../../../common/enums/repair-status.enum';

const DB = 'zaff_tenant_test';
const storekeeper = { userId: new Types.ObjectId().toString(), name: 'Koné' };
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa' };
const DAY = 24 * 3600 * 1000;
const ALL_CONDITIONS = DEFAULT_RETURN_POLICY.conditions;

describe('Règles de retour (politique de la boutique)', () => {
  const soldAt = new Date('2026-10-01T10:00:00Z');
  const at = (days: number) => new Date(soldAt.getTime() + days * DAY);
  const ev = (policy: ReturnPolicy, days: number, warrantyEnd: Date | null = null) =>
    evaluateReturn(policy, { soldAt, price: 850000, warrantyEnd, now: at(days) });

  it('changement d\'avis dans le délai : avoir et échange (politique par défaut), sans remboursement', () => {
    const r = ev(DEFAULT_RETURN_POLICY, 3);
    expect(r.changeOfMind.allowed).toBe(true);
    expect(r.changeOfMind.options.map((o) => o.action)).toEqual(['exchange', 'credit_note']);
    expect(r.changeOfMind.conditions).toHaveLength(4);
  });

  it('changement d\'avis hors délai : refusé avec une explication', () => {
    const r = ev(DEFAULT_RETURN_POLICY, 12);
    expect(r.changeOfMind.allowed).toBe(false);
    expect(r.changeOfMind.reason).toBe('Délai de retour dépassé : 7 jours maximum, achat il y a 12 jours.');
  });

  it('frais de remise en stock déduits du montant rendu', () => {
    const policy = resolveReturnPolicy({ returnPolicy: { restockingFeePercent: 10, changeOfMind: { refund: true } } });
    const r = ev(policy, 1);
    expect(r.changeOfMind.fee).toBe(85000);
    expect(r.changeOfMind.options.find((o) => o.action === 'refund')).toMatchObject({ amount: 765000, refundMethods: ['cash', 'mobile'] });
  });

  it('boutique qui refuse les retours pour changement d\'avis', () => {
    const r = ev(resolveReturnPolicy({ returnPolicy: { returnsEnabled: false } }), 1);
    expect(r.changeOfMind).toMatchObject({ allowed: false, reason: "La boutique n'accepte pas les retours pour changement d'avis." });
  });

  it('panne dans les premiers jours : échange ou avoir intégral (sans frais) + réparation sous garantie', () => {
    const policy = resolveReturnPolicy({ returnPolicy: { restockingFeePercent: 10 } });
    const r = ev(policy, 2);
    expect(r.defective.stage).toBe('early');
    expect(r.defective.options.map((o) => [o.action, o.amount])).toEqual([
      ['exchange', 850000],
      ['credit_note', 850000],
      ['warranty_repair', undefined],
    ]);
  });

  it('panne après les premiers jours, sous garantie : réparation gratuite uniquement', () => {
    const r = ev(DEFAULT_RETURN_POLICY, 60);
    expect(r.underWarranty).toBe(true);
    expect(r.defective.stage).toBe('warranty');
    expect(r.defective.options.map((o) => o.action)).toEqual(['warranty_repair']);
  });

  it('panne hors garantie : réparation payante (devis), ou refus si la boutique ne la propose pas', () => {
    const r = ev(DEFAULT_RETURN_POLICY, 400);
    expect(r.defective).toMatchObject({ stage: 'out_of_warranty', allowed: true });
    expect(r.defective.options.map((o) => o.action)).toEqual(['paid_repair']);

    const none = ev(resolveReturnPolicy({ returnPolicy: { defective: { paidRepairOutOfWarranty: false } } }), 400);
    expect(none.defective.allowed).toBe(false);
    expect(none.defective.reason).toContain('Garantie terminée');
  });

  it('la garantie précisée à la vente prime sur la garantie par défaut', () => {
    const r = ev(DEFAULT_RETURN_POLICY, 100, at(90));
    expect(r.underWarranty).toBe(false);
    expect(r.defective.options.map((o) => o.action)).toEqual(['paid_repair']);
  });
});

describe('Retours : stock, avoirs, atelier et caisse', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let sales: SalesService;
  let units: UnitsService;
  let repairs: RepairsService;
  let returns: ReturnsService;
  let closings: CashClosingsService;
  let notified: any[];
  let iphone: any;
  let policy: ReturnPolicy;

  const stock = () => conn.models.Product.docs.find((d) => d._id === iphone._id).stockQuantity;
  const unit = (s: string) => conn.models.ProductUnit.docs.find((d) => d.serialNumber === s);
  const ageSale = (serial: string, days: number) => {
    const sale = conn.models.Sale.docs.find((s) => s.items.some((i: any) => i.serialNumber === serial));
    sale.saleDate = new Date(Date.now() - days * DAY);
    // La garantie créée à la vente (12 mois) vieillit avec elle
    for (const w of conn.models.Warranty?.docs || []) {
      if (w.serialNumber === serial) w.warrantyEnd = new Date(new Date(sale.saleDate).setMonth(sale.saleDate.getMonth() + 12));
    }
  };

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'], CreditNote: ['code'], ProductReturn: ['returnNumber'] });
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    repairs = new RepairsService(conn as any, notifications);
    returns = new ReturnsService(conn as any, repairs, notifications);
    closings = new CashClosingsService(conn as any, notifications);
    policy = resolveReturnPolicy({ returnPolicy: { changeOfMind: { refund: true } } });
    iphone = await conn.getModel(DB, 'Product').create({
      name: 'iPhone 15 Pro', sku: 'IPH15P', category: 'smartphones', salePrice: 850000, stockQuantity: 0, minStockAlert: 0, hasSerialNumbers: true,
    });
    await units.addUnits(DB, { productId: String(iphone._id), serialNumbers: ['IMEI1', 'IMEI2', 'IMEI3'] }, storekeeper);
    await units.sell(DB, { serialNumber: 'IMEI1', customerName: 'Michel', customerPhone: '+2250701', warrantyMonths: 12 }, seller);
    expect(stock()).toBe(2);
  });

  it('la recherche du N° de série montre la vente, le client et les solutions possibles', async () => {
    const r = await returns.lookup(DB, policy, 'imei1');
    expect(r.sale).toMatchObject({ invoiceNumber: 1001, sellerName: 'Awa', customer: { name: 'Michel' } });
    expect(r.changeOfMind.options.map((o) => o.action)).toEqual(['exchange', 'credit_note', 'refund']);
    expect(r.underWarranty).toBe(true);
  });

  it('bon état → avoir : l\'appareil revient en stock après le scan, l\'avoir est créé', async () => {
    const ret: any = await returns.create(DB, policy, seller, {
      serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS,
    });
    expect(unit('IMEI1').status).toBe(UnitStatus.IN_STOCK);
    expect(unit('IMEI1').saleId).toBeNull();
    expect(stock()).toBe(3);
    expect(ret).toMatchObject({ returnNumber: 1001, creditNoteCode: 'AV-1001', amount: 850000, unitStatusAfter: 'in_stock' });
    const note = conn.models.CreditNote.docs[0];
    expect(note).toMatchObject({ code: 'AV-1001', balance: 850000, status: 'active' });
    expect(notified.find((n) => n.type === 'return.created').message).toContain('avoir AV-1001');
  });

  it('bon état mais une condition non remplie (emballage manquant) → refusé, rien ne bouge', async () => {
    await expect(
      returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS.slice(1) }),
    ).rejects.toThrow("Condition non remplie : Emballage d'origine complet");
    expect(unit('IMEI1').status).toBe(UnitStatus.SOLD);
    expect(stock()).toBe(2);
  });

  it('retour hors délai refusé ; solution non autorisée par la boutique refusée', async () => {
    ageSale('IMEI1', 10);
    await expect(
      returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS }),
    ).rejects.toThrow('Délai de retour dépassé');

    await expect(
      returns.create(DB, DEFAULT_RETURN_POLICY, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'refund', refundMethod: 'cash', issueDescription: 'Écran noir' }),
    ).rejects.toThrow('« remboursement » n\'est pas proposée');
  });

  it('remboursement en espèces : déduit de la caisse du vendeur à la clôture', async () => {
    await returns.create(DB, policy, seller, {
      serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'refund', refundMethod: 'cash', conditionsChecked: ALL_CONDITIONS,
    });
    const cur = await closings.current(DB, seller.userId);
    expect(cur.totals.cash).toBe(0); // 850 000 encaissés − 850 000 rendus
    expect(cur.refunds).toEqual({ cash: 850000, mobile: 0, count: 1 });

    const closing: any = await closings.close(DB, seller, { declaredCash: 0 });
    expect(closing).toMatchObject({ expectedCash: 0, cashDifference: 0, refunds: { cash: 850000, count: 1 } });
  });

  it('défectueux à l\'achat → échange : l\'appareil NE revient PAS en stock, part à l\'atelier, l\'avoir paie le nouvel appareil', async () => {
    const ret: any = await returns.create(DB, policy, seller, {
      serialNumber: 'IMEI1', reason: 'defective', action: 'exchange', issueDescription: 'Ne charge pas',
    });
    expect(unit('IMEI1').status).toBe(UnitStatus.DEFECTIVE);
    expect(stock()).toBe(2);
    const repair = conn.models.Repair.docs[0];
    expect(repair).toMatchObject({ ownership: 'shop', underWarranty: true, serialNumber: 'IMEI1', customerId: null });
    expect(ret.repairTicketNumber).toBe(1001);

    // Le client repart avec un autre appareil, payé avec l'avoir
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI2', creditNoteCode: ret.creditNoteCode }, seller);
    expect(sale).toMatchObject({ creditNoteCode: 'AV-1001', creditNoteAmount: 850000, paidAmount: 0 });
    expect(conn.models.CreditNote.docs[0]).toMatchObject({ balance: 0, status: 'used' });
    // La caisse ne compte pas l'échange comme de l'argent encaissé
    expect((await closings.current(DB, seller.userId)).totals.cash).toBe(850000);

    // Un avoir déjà utilisé est refusé, et la vente est entièrement annulée
    await expect(units.sell(DB, { serialNumber: 'IMEI3', creditNoteCode: 'av-1001' }, seller)).rejects.toThrow('déjà été utilisé');
    expect(unit('IMEI3').status).toBe(UnitStatus.IN_STOCK);
    expect(stock()).toBe(1);
  });

  it('défectueux sous garantie → réparation gratuite : hors stock, visible à l\'atelier, rendu au client ensuite', async () => {
    ageSale('IMEI1', 60);
    await returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'warranty_repair', issueDescription: 'Micro HS' });
    expect(unit('IMEI1').status).toBe(UnitStatus.IN_REPAIR);
    expect(stock()).toBe(2);
    const repair = conn.models.Repair.docs[0];
    expect(repair).toMatchObject({ ownership: 'customer', underWarranty: true, estimatedCost: 0 });
    expect(String(repair.customerId)).toBe(String(conn.models.Sale.docs[0].customerId));
    expect(conn.models.Warranty.docs[0].status).toBe('claimed');

    await repairs.update(DB, String(repair._id), { status: RepairStatus.RETURNED });
    expect(unit('IMEI1').status).toBe(UnitStatus.SOLD);
    expect(stock()).toBe(2);
  });

  it('hors garantie → seule la réparation payante est possible', async () => {
    ageSale('IMEI1', 400);
    await expect(
      returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'warranty_repair', issueDescription: 'x' }),
    ).rejects.toThrow("n'est pas proposée");
    await returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'paid_repair', issueDescription: 'Écran cassé' });
    expect(conn.models.Repair.docs[0]).toMatchObject({ underWarranty: false, ownership: 'customer' });
  });

  it('un appareil ne peut pas être retourné deux fois ; un appareil jamais vendu ou inconnu est refusé', async () => {
    await returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'warranty_repair', issueDescription: 'Micro HS' });
    await expect(returns.lookup(DB, policy, 'IMEI1')).rejects.toThrow('a déjà été retourné (retour RET-1001, ticket SAV-1001)');
    await expect(returns.lookup(DB, policy, 'IMEI2')).rejects.toThrow("est en stock : il n'a pas encore été vendu");
    await expect(returns.lookup(DB, policy, 'INCONNU')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('défectueux : la description de la panne est obligatoire', async () => {
    await expect(returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'defective', action: 'exchange' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('avoir expiré refusé à la caisse', async () => {
    const ret: any = await returns.create(DB, policy, seller, {
      serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS,
    });
    conn.models.CreditNote.docs[0].expiresAt = new Date(Date.now() - DAY);
    await expect(units.sell(DB, { serialNumber: 'IMEI2', creditNoteCode: ret.creditNoteCode }, seller)).rejects.toThrow('a expiré');
  });

  it('numérotation : retours, avoirs et tickets SAV se suivent', async () => {
    await units.sell(DB, { serialNumber: 'IMEI2' }, seller);
    await units.sell(DB, { serialNumber: 'IMEI3' }, seller);
    const a: any = await returns.create(DB, policy, seller, { serialNumber: 'IMEI1', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS });
    const b: any = await returns.create(DB, policy, seller, { serialNumber: 'IMEI2', reason: 'change_of_mind', action: 'credit_note', conditionsChecked: ALL_CONDITIONS });
    const c: any = await returns.create(DB, policy, seller, { serialNumber: 'IMEI3', reason: 'defective', action: 'warranty_repair', issueDescription: 'HS' });
    expect([a.returnNumber, b.returnNumber, c.returnNumber]).toEqual([1001, 1002, 1003]);
    expect([a.creditNoteCode, b.creditNoteCode]).toEqual(['AV-1001', 'AV-1002']);
    expect(conn.models.Sale.docs.map((s) => s.invoiceNumber)).toEqual([1001, 1002, 1003]);
  });
});
