import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { CashClosingsService } from './cash-closings.service';

const DB = 'zaff_tenant_test';
const awa = { userId: new Types.ObjectId().toString(), name: 'Awa' };
const ali = { userId: new Types.ObjectId().toString(), name: 'Ali' };
const owner = { userId: new Types.ObjectId().toString(), name: 'Patron' };

describe('Clôture de caisse', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let service: CashClosingsService;
  let notified: any[];

  const sale = (seller: typeof awa, total: number, paymentMethod: string, minutesAgo = 10) =>
    conn.getModel(DB, 'Sale').create({
      invoiceNumber: 1000 + conn.getModel(DB, 'Sale').docs.length,
      sellerId: new Types.ObjectId(seller.userId),
      sellerName: seller.name,
      total,
      paymentMethod,
      saleDate: new Date(Date.now() - minutesAgo * 60000),
      items: [{ productName: 'iPhone', quantity: 1 }],
      closingId: null,
    });

  beforeEach(async () => {
    conn = fakeTenantConnection();
    notified = [];
    const notifications: any = { notify: async (_db: string, n: any) => notified.push(n), invalidate: () => undefined };
    service = new CashClosingsService(conn as any, notifications);
    await sale(awa, 850000, 'cash', 60);
    await sale(awa, 400000, 'mobile', 30);
    await sale(awa, 15000, 'cash', 5);
    await sale(ali, 99000, 'cash', 20);
  });

  it('affiche la caisse en cours du vendeur, sans les ventes des autres', async () => {
    const cur = await service.current(DB, awa.userId);
    expect(cur.salesCount).toBe(3);
    expect(cur.totals).toEqual({ cash: 865000, mobile: 400000, card: 0, bank_transfer: 0, credit: 0 });
    expect(cur.expectedCash).toBe(865000);
    expect(cur.totalAmount).toBe(1265000);
    expect(cur.sales).toHaveLength(3);
  });

  it('clôture : totaux calculés par le serveur, écart sur les espèces, patron notifié', async () => {
    const closing: any = await service.close(DB, awa, { declaredCash: 864500, notes: 'Pièce manquante' });

    expect(closing).toMatchObject({ salesCount: 3, expectedCash: 865000, declaredCash: 864500, cashDifference: -500, status: 'submitted' });
    expect(closing.totals.mobile).toBe(400000);
    const n = notified.find((x) => x.type === 'cash.closed');
    expect(n).toMatchObject({ roles: ['admin'], level: 'warning', title: 'Clôture de caisse avec écart' });
    expect(n.message.replace(/\s/g, ' ')).toContain('865 000 F en espèces et 400 000 F en Mobile Money à remettre (il manque 500 F)');

    // Les ventes clôturées ne sont plus dans la caisse en cours ; celles d'Ali restent ouvertes
    expect((await service.current(DB, awa.userId)).salesCount).toBe(0);
    expect((await service.current(DB, ali.userId)).salesCount).toBe(1);
  });

  it('ne compte jamais une vente deux fois et refuse une clôture vide', async () => {
    await service.close(DB, awa, { declaredCash: 865000 });
    await expect(service.close(DB, awa, { declaredCash: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.close(DB, awa, { declaredCash: 0 })).rejects.toThrow('Aucune vente à clôturer');

    // Une nouvelle vente après la clôture part dans la clôture suivante
    await sale(awa, 5000, 'cash', 0);
    const next: any = await service.close(DB, awa, { declaredCash: 5000 });
    expect(next).toMatchObject({ salesCount: 1, totalAmount: 5000, cashDifference: 0 });
    expect(notified.at(-1)).toMatchObject({ title: 'Clôture de caisse', level: 'info' });
  });

  it('le patron voit les caisses encore ouvertes par vendeur', async () => {
    await service.close(DB, ali, { declaredCash: 99000 });
    const open = await service.openRegisters(DB);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ sellerName: 'Awa', salesCount: 3, totalAmount: 1265000 });
    expect(open[0].totals.cash).toBe(865000);
  });

  it('validation par le patron : une seule fois, et le vendeur est prévenu personnellement', async () => {
    const closing: any = await service.close(DB, awa, { declaredCash: 865000 });
    const validated: any = await service.validate(DB, String(closing._id), owner, { notes: 'Reçu' });

    expect(validated).toMatchObject({ status: 'validated', validatedByName: 'Patron', ownerNotes: 'Reçu' });
    const n = notified.find((x) => x.type === 'cash.validated');
    expect(n).toMatchObject({ roles: [], userIds: [awa.userId], level: 'success' });
    await expect(service.validate(DB, String(closing._id), owner, {})).rejects.toThrow('déjà validée');
  });

  it('le vendeur ne voit que ses propres clôtures', async () => {
    await service.close(DB, awa, { declaredCash: 865000 });
    await service.close(DB, ali, { declaredCash: 99000 });
    expect(await service.list(DB, { sellerId: awa.userId })).toHaveLength(1);
    expect(await service.list(DB, {})).toHaveLength(2);
  });
});
