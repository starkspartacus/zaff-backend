import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Actor } from '../sales/sales.service';
import { CashClosing, CashClosingSchema, PaymentTotals } from './cash-closing.schema';
import { CloseRegisterDto, ValidateClosingDto } from './dto/cash-closing.dto';
import { ProductReturn, ProductReturnSchema } from '../returns/schemas/product-return.schema';
import { CustomerPayment, CustomerPaymentSchema } from '../common/schemas/customer-payment.schema';
import { TenantUser, TenantUserSchema } from '../common/schemas/tenant-user.schema';
import { Consignment, ConsignmentSchema } from '../consignments/consignment.schema';
import { MailService } from '../../mail/mail.service';
import { buildClosingReport } from './closing-report';

/** Boutique (pour le rapport) : nom, devise, e-mail, téléphone */
export interface ShopInfo {
  name?: string;
  currency?: string;
  email?: string | null;
  phone?: string | null;
}

/** Référence lisible d'une clôture (« CL-3F9A2C ») */
export const closingCode = (id: unknown) => `CL-${String(id).slice(-6).toUpperCase()}`;

const emptyTotals = (): PaymentTotals => ({ cash: 0, mobile: 0, card: 0, bank_transfer: 0, credit: 0 });

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

@Injectable()
export class CashClosingsService {
  private readonly logger = new Logger(CashClosingsService.name);

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private getUserModel(db: string) { return this.tenantConnectionService.getModel<TenantUser>(db, TenantUser.name, TenantUserSchema); }
  private getConsignmentModel(db: string) { return this.tenantConnectionService.getModel<Consignment>(db, Consignment.name, ConsignmentSchema); }

  /** Adresses du patron : propriétaires avec un e-mail, sinon l'e-mail de la boutique */
  private async ownerContacts(db: string, shop: ShopInfo) {
    const owners = await this.getUserModel(db).find({ role: 'admin' }).lean().exec();
    const emails = [...new Set([...owners.map((o: any) => o.email).filter(Boolean), shop.email].filter(Boolean) as string[])];
    const phone = (owners.find((o: any) => o.phone) as any)?.phone || shop.phone || null;
    return { emails, phone };
  }

  /** Rapport d'une clôture : texte (WhatsApp), HTML (e-mail), téléphone du patron. Un vendeur ne lit que les siens */
  async report(db: string, id: string, viewer: { userId: string; role?: string }, shop: ShopInfo = {}) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Clôture introuvable.');
    const closing: any = await this.getClosingModel(db).findById(id).lean().exec();
    if (!closing || (viewer.role === 'seller' && String(closing.sellerId) !== String(viewer.userId))) throw new NotFoundException('Clôture introuvable.');
    const sales = await this.getSaleModel(db).find({ closingId: closing._id }).sort({ saleDate: 1 }).lean().exec();
    const open = await this.getConsignmentModel(db).find({ status: 'open' }).lean().exec();
    const now = Date.now();
    const consignments = { units: 0, value: 0, overdueUnits: 0, resellers: new Set<string>().size };
    for (const c of open as any[]) {
      const out = (c.items || []).filter((i: any) => i.status === 'out');
      consignments.units += out.length;
      consignments.value += out.reduce((n: number, i: any) => n + i.price, 0);
      if (new Date(c.dueAt).getTime() < now) consignments.overdueUnits += out.length;
    }
    const built = buildClosingReport({
      shopName: shop.name || 'Ma boutique',
      currency: shop.currency || 'F CFA',
      closing: { ...closing, code: closingCode(closing._id) },
      sales: sales as any,
      consignments,
    });
    const contacts = await this.ownerContacts(db, shop);
    return { ...built, code: closingCode(closing._id), ownerPhone: contacts.phone, emailedTo: closing.emailedTo || [], emailedAt: closing.emailedAt || null, mailEnabled: !!this.mail?.enabled };
  }

  /** Envoi automatique du rapport au patron, en arrière-plan (ne bloque jamais la clôture) */
  private async emailReport(db: string, closing: any, shop: ShopInfo) {
    if (!this.mail?.enabled) return;
    const { emails } = await this.ownerContacts(db, shop);
    if (!emails.length) return;
    const r = await this.report(db, String(closing._id), { userId: String(closing.sellerId) }, shop);
    const ok = await this.mail.send({ to: emails, subject: r.subject, text: r.text.replace(/\*/g, ''), html: r.html });
    if (ok) await this.getClosingModel(db).updateOne({ _id: closing._id }, { $set: { emailedTo: emails, emailedAt: new Date() } });
  }

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getReturnModel(db: string) { return this.tenantConnectionService.getModel<ProductReturn>(db, ProductReturn.name, ProductReturnSchema); }
  private getPaymentModel(db: string) { return this.tenantConnectionService.getModel<CustomerPayment>(db, CustomerPayment.name, CustomerPaymentSchema); }
  private getClosingModel(db: string) { return this.tenantConnectionService.getModel<CashClosing>(db, CashClosing.name, CashClosingSchema); }

  /** Totaux par mode de paiement d'un ensemble de ventes */
  private async summarize(db: string, match: Record<string, unknown>) {
    const rows = await this.getSaleModel(db).aggregate([
      { $match: match },
      {
        $group: {
          _id: '$paymentMethod',
          // La part payée avec un avoir n'est pas de l'argent encaissé
          // À crédit : l'acompte est compté avec les paiements des clients (customer_payments)
          amount: { $sum: { $subtract: [{ $subtract: ['$total', { $ifNull: ['$creditNoteAmount', 0] }] }, { $ifNull: ['$depositAmount', 0] }] } },
          count: { $sum: 1 },
          items: { $sum: { $size: '$items' } },
          first: { $min: '$saleDate' },
          last: { $max: '$saleDate' },
        },
      },
    ]);
    const totals = emptyTotals();
    let salesCount = 0;
    let itemsCount = 0;
    let first: Date | null = null;
    let last: Date | null = null;
    for (const r of rows) {
      const key = (r._id || 'cash') as keyof PaymentTotals;
      totals[key in totals ? key : 'cash'] += r.amount;
      salesCount += r.count;
      itemsCount += r.items;
      if (!first || r.first < first) first = r.first;
      if (!last || r.last > last) last = r.last;
    }
    const totalAmount = Object.values(totals).reduce((a, b) => a + b, 0);
    return { totals, totalAmount, salesCount, itemsCount, first, last };
  }

  /** Remboursements de retours (espèces / Mobile Money) sortis de la caisse */
  private async summarizeRefunds(db: string, match: Record<string, unknown>) {
    const rows = await this.getReturnModel(db).aggregate([
      { $match: { ...match, action: 'refund' } },
      { $group: { _id: '$refundMethod', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const refunds = { cash: 0, mobile: 0, count: 0 };
    for (const r of rows) {
      if (r._id === 'mobile') refunds.mobile += r.amount;
      else refunds.cash += r.amount;
      refunds.count += r.count;
    }
    return refunds;
  }

  /** Paiements des clients à crédit encaissés (acomptes, versements ; remboursements de retours en négatif) */
  private async summarizePayments(db: string, match: Record<string, unknown>) {
    const rows = await this.getPaymentModel(db).aggregate([
      { $match: match },
      { $group: { _id: '$method', amount: { $sum: '$amount' }, count: { $sum: 1 }, first: { $min: '$createdAt' } } },
    ]);
    const byMethod: Partial<PaymentTotals> = {};
    let amount = 0;
    let count = 0;
    let first: Date | null = null;
    for (const r of rows) {
      const key = (['cash', 'mobile', 'card', 'bank_transfer'].includes(r._id) ? r._id : 'cash') as keyof PaymentTotals;
      byMethod[key] = (byMethod[key] || 0) + r.amount;
      amount += r.amount;
      count += r.count;
      if (!first || r.first < first) first = r.first;
    }
    return { byMethod, amount, count, first };
  }

  /** Ventes + paiements reçus − remboursements : ce que le collaborateur doit réellement remettre */
  private async register(db: string, salesMatch: Record<string, unknown>, refundsMatch: Record<string, unknown>, paymentsMatch: Record<string, unknown>) {
    const [s, refunds, pay] = await Promise.all([
      this.summarize(db, salesMatch),
      this.summarizeRefunds(db, refundsMatch),
      this.summarizePayments(db, paymentsMatch),
    ]);
    const totals = { ...s.totals, cash: s.totals.cash - refunds.cash, mobile: s.totals.mobile - refunds.mobile };
    for (const [k, v] of Object.entries(pay.byMethod) as [keyof PaymentTotals, number][]) totals[k] += v;
    const first = [s.first, pay.first].filter(Boolean).sort((a, b) => +a! - +b!)[0] || null;
    return {
      ...s,
      first,
      totals,
      refunds,
      collections: { amount: pay.amount, count: pay.count },
      totalAmount: s.totalAmount - refunds.cash - refunds.mobile + pay.amount,
    };
  }

  /** Caisse en cours du collaborateur : ventes pas encore clôturées */
  async current(db: string, sellerId: string) {
    const match = { sellerId: new Types.ObjectId(sellerId), closingId: null };
    const [summary, sales, lastClosing] = await Promise.all([
      this.register(db, match, { processedBy: new Types.ObjectId(sellerId), closingId: null }, { collectedBy: new Types.ObjectId(sellerId), closingId: null }),
      this.getSaleModel(db)
        .find(match, { invoiceNumber: 1, total: 1, paymentMethod: 1, saleDate: 1, 'items.productName': 1, 'items.serialNumber': 1 })
        .sort({ saleDate: -1 })
        .limit(100)
        .lean()
        .exec(),
      this.getClosingModel(db).findOne({ sellerId: new Types.ObjectId(sellerId) }).sort({ closedAt: -1 }).lean().exec(),
    ]);
    return {
      ...summary,
      expectedCash: summary.totals.cash,
      since: summary.first,
      lastClosedAt: lastClosing?.closedAt || null,
      sales,
    };
  }

  /**
   * Clôture la caisse : les ventes non clôturées du collaborateur sont rattachées à la clôture
   * en une seule écriture (une vente ne peut pas être comptée deux fois, ni manquée si une vente
   * arrive pendant la clôture : elle ira dans la suivante).
   */
  async close(db: string, actor: Actor, dto: CloseRegisterDto, shop: ShopInfo = {}) {
    const saleModel = this.getSaleModel(db);
    const closingModel = this.getClosingModel(db);
    const sellerId = new Types.ObjectId(actor.userId);
    const closingId = new Types.ObjectId();
    const closedAt = new Date();

    const claimed = await saleModel.updateMany(
      { sellerId, closingId: null, saleDate: { $lte: closedAt } },
      { $set: { closingId } },
    );
    const claimedRefunds = await this.getReturnModel(db).updateMany(
      { processedBy: sellerId, closingId: null, action: 'refund', createdAt: { $lte: closedAt } },
      { $set: { closingId } },
    );
    const claimedPayments = await this.getPaymentModel(db).updateMany(
      { collectedBy: sellerId, closingId: null, createdAt: { $lte: closedAt } },
      { $set: { closingId } },
    );
    if (!claimed.modifiedCount && !claimedRefunds.modifiedCount && !claimedPayments.modifiedCount) {
      throw new BadRequestException('Rien à clôturer depuis votre dernière clôture (aucune vente ni encaissement).');
    }

    try {
      const s = await this.register(db, { closingId }, { closingId }, { closingId });
      const declaredCash = Math.round(dto.declaredCash);
      const closing = await closingModel.create({
        _id: closingId,
        sellerId,
        sellerName: actor.name,
        openedAt: s.first || closedAt,
        closedAt,
        salesCount: s.salesCount,
        itemsCount: s.itemsCount,
        totals: s.totals,
        totalAmount: s.totalAmount,
        refunds: s.refunds,
        collections: s.collections,
        expectedCash: s.totals.cash,
        declaredCash,
        cashDifference: declaredCash - s.totals.cash,
        notes: dto.notes || null,
        status: 'submitted',
      });

      await this.publishClosed(db, closing, actor);
      this.emailReport(db, closing, shop).catch((e) => this.logger.warn(`Rapport de clôture non envoyé : ${e.message}`));
      return closing;
    } catch (e) {
      // Échec après la réservation : les ventes redeviennent « à clôturer »
      await saleModel.updateMany({ closingId }, { $set: { closingId: null } }).catch(() => undefined);
      await this.getReturnModel(db).updateMany({ closingId }, { $set: { closingId: null } }).catch(() => undefined);
      await this.getPaymentModel(db).updateMany({ closingId }, { $set: { closingId: null } }).catch(() => undefined);
      throw e;
    }
  }

  private async publishClosed(db: string, c: any, actor: Actor) {
    const diff = c.cashDifference;
    const diffText = diff === 0 ? 'caisse juste' : diff < 0 ? `il manque ${fmt(-diff)}` : `excédent de ${fmt(diff)}`;
    await this.notifications.notify(db, {
      type: 'cash.closed',
      title: diff === 0 ? 'Clôture de caisse' : 'Clôture de caisse avec écart',
      message: `${actor.name} a clôturé sa caisse : ${c.salesCount} vente${c.salesCount > 1 ? 's' : ''}${c.refunds?.count ? `, ${c.refunds.count} remboursement${c.refunds.count > 1 ? 's' : ''}` : ''}, ${fmt(c.expectedCash)} en espèces et ${fmt(c.totals.mobile)} en Mobile Money à remettre (${diffText}).`,
      level: diff === 0 ? 'info' : 'warning',
      roles: ['admin'],
      actorId: actor.userId,
      data: {
        closingId: String(c._id),
        amount: c.totalAmount,
        cash: c.expectedCash,
        mobile: c.totals.mobile,
        declaredCash: c.declaredCash,
        cashDifference: diff,
        sellerName: actor.name,
      },
    });
    this.notifications.invalidate(db, ['cash-closings', 'my-stats']);
  }

  async list(db: string, filter: { sellerId?: string; status?: string; from?: Date }) {
    const query: Record<string, unknown> = {};
    if (filter.sellerId) query.sellerId = new Types.ObjectId(filter.sellerId);
    if (filter.status && filter.status !== 'all') query.status = filter.status;
    if (filter.from) query.closedAt = { $gte: filter.from };
    return this.getClosingModel(db).find(query).sort({ closedAt: -1 }).limit(200).lean().exec();
  }

  /** Propriétaire : caisses encore ouvertes (ventes non clôturées), par collaborateur */
  async openRegisters(db: string) {
    const rows = await this.getSaleModel(db).aggregate([
      { $match: { closingId: null, sellerId: { $ne: null } } },
      {
        $group: {
          _id: { seller: '$sellerId', method: '$paymentMethod' },
          sellerName: { $first: '$sellerName' },
          amount: { $sum: { $subtract: [{ $subtract: ['$total', { $ifNull: ['$creditNoteAmount', 0] }] }, { $ifNull: ['$depositAmount', 0] }] } },
          count: { $sum: 1 },
          first: { $min: '$saleDate' },
          last: { $max: '$saleDate' },
        },
      },
    ]);
    const bySeller = new Map<string, any>();
    for (const r of rows) {
      const id = String(r._id.seller);
      const e = bySeller.get(id) || { sellerId: id, sellerName: r.sellerName, totals: emptyTotals(), totalAmount: 0, salesCount: 0, since: r.first, lastSaleAt: r.last };
      const key = (r._id.method || 'cash') as keyof PaymentTotals;
      e.totals[key in e.totals ? key : 'cash'] += r.amount;
      e.totalAmount += r.amount;
      e.salesCount += r.count;
      if (r.first < e.since) e.since = r.first;
      if (r.last > e.lastSaleAt) e.lastSaleAt = r.last;
      bySeller.set(id, e);
    }
    const refunds = await this.getReturnModel(db).aggregate([
      { $match: { closingId: null, action: 'refund' } },
      { $group: { _id: { seller: '$processedBy', method: '$refundMethod' }, sellerName: { $first: '$processedByName' }, amount: { $sum: '$amount' }, first: { $min: '$createdAt' } } },
    ]);
    for (const r of refunds) {
      const id = String(r._id.seller);
      const e = bySeller.get(id) || { sellerId: id, sellerName: r.sellerName, totals: emptyTotals(), totalAmount: 0, salesCount: 0, since: r.first, lastSaleAt: r.first };
      const key = r._id.method === 'mobile' ? 'mobile' : 'cash';
      e.totals[key] -= r.amount;
      e.totalAmount -= r.amount;
      bySeller.set(id, e);
    }
    const payments = await this.getPaymentModel(db).aggregate([
      { $match: { closingId: null, collectedBy: { $ne: null } } },
      { $group: { _id: { seller: '$collectedBy', method: '$method' }, sellerName: { $first: '$collectedByName' }, amount: { $sum: '$amount' }, first: { $min: '$createdAt' } } },
    ]);
    for (const r of payments) {
      const id = String(r._id.seller);
      const e = bySeller.get(id) || { sellerId: id, sellerName: r.sellerName, totals: emptyTotals(), totalAmount: 0, salesCount: 0, since: r.first, lastSaleAt: r.first };
      const key = (['cash', 'mobile', 'card', 'bank_transfer'].includes(r._id.method) ? r._id.method : 'cash') as keyof PaymentTotals;
      e.totals[key] += r.amount;
      e.totalAmount += r.amount;
      bySeller.set(id, e);
    }
    return [...bySeller.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }

  /** Propriétaire : confirme avoir reçu l'argent de la clôture */
  async validate(db: string, id: string, owner: Actor, dto: ValidateClosingDto) {
    const closing = await this.getClosingModel(db).findOneAndUpdate(
      { _id: id, status: 'submitted' },
      {
        $set: {
          status: 'validated',
          validatedBy: new Types.ObjectId(owner.userId),
          validatedByName: owner.name,
          validatedAt: new Date(),
          ownerNotes: dto.notes || null,
        },
      },
      { new: true },
    );
    if (!closing) {
      const exists = await this.getClosingModel(db).exists({ _id: id });
      throw exists ? new BadRequestException('Cette clôture est déjà validée.') : new NotFoundException('Clôture introuvable.');
    }

    await this.notifications.notify(db, {
      type: 'cash.validated',
      title: 'Clôture validée',
      message: `${owner.name} a confirmé la réception de votre caisse du ${closing.closedAt.toLocaleDateString('fr-FR')} (${fmt(closing.declaredCash)} en espèces).`,
      level: 'success',
      roles: [],
      userIds: [String(closing.sellerId)],
      actorId: owner.userId,
      data: { closingId: String(closing._id), amount: closing.totalAmount },
    });
    this.notifications.invalidate(db, ['cash-closings']);
    return closing;
  }
}
