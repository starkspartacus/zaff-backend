import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { nextSequence } from '../common/sequence';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { SaleType } from '../../../common/enums/sale-type.enum';
import { toE164 } from '../../../common/geo/geo';
import { NotificationsService } from '../notifications/notifications.service';
import { Actor, SalesService, normalizeSerial } from '../sales/sales.service';
import { EstablishmentsService } from '../../global/establishments/establishments.service';
import { Consignment, ConsignmentItem, ConsignmentSchema } from './consignment.schema';
import { CreateConsignmentDto, SettleConsignmentDto } from './consignment.dto';

export const DEFAULT_CONSIGNMENT_DAYS = 3;
const DAY = 24 * 3600 * 1000;
/** Relance au plus une fois par jour et par bon */
const REMIND_EVERY_MS = 20 * 3600 * 1000;
const CHECK_EVERY_MS = 3600 * 1000;

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const dateFr = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Jours écoulés depuis la remise (0 le jour même) */
export const daysSince = (d: Date, now = Date.now()) => Math.max(0, Math.floor((now - new Date(d).getTime()) / DAY));

@Injectable()
export class ConsignmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsignmentsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly tenants: TenantConnectionService,
    private readonly sales: SalesService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly establishments?: EstablishmentsService,
  ) {}

  private model(db: string) { return this.tenants.getModel<Consignment>(db, Consignment.name, ConsignmentSchema); }
  private units(db: string) { return this.tenants.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private products(db: string) { return this.tenants.getModel<Product>(db, Product.name, ProductSchema); }
  private customers(db: string) { return this.tenants.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private movements(db: string) { return this.tenants.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private counters(db: string) { return this.tenants.getModel<Counter>(db, Counter.name, CounterSchema); }

  // ─── Relances : toutes les heures, chaque bon en retard est rappelé au patron et au vendeur (une fois par jour) ───

  onModuleInit() {
    if (!this.establishments || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.remindAll().catch((e) => this.logger.warn(`Relances revendeurs : ${e.message}`)), CHECK_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async remindAll() {
    const shops = (await this.establishments?.findAll()) || [];
    for (const shop of shops) {
      const db = (shop as { databaseName?: string }).databaseName;
      if (db) await this.remindOverdue(db).catch((e) => this.logger.warn(`Relances ${db} : ${e.message}`));
    }
  }

  /** Bons dont la date de retour est dépassée : notification au patron et au collaborateur qui a remis */
  async remindOverdue(db: string, now = new Date()) {
    const late = await this.model(db).find({ status: 'open', dueAt: { $lt: now } }).exec();
    let sent = 0;
    for (const c of late) {
      if (c.lastReminderAt && now.getTime() - new Date(c.lastReminderAt).getTime() < REMIND_EVERY_MS) continue;
      const out = c.items.filter((i) => i.status === 'out');
      if (!out.length) continue;
      const days = daysSince((c as unknown as { createdAt: Date }).createdAt, now.getTime());
      const what = out.length === 1 ? `${out[0].productName} (${out[0].serialNumber})` : `${out.length} appareils`;
      await this.notifications.notify(db, {
        type: 'consignment.overdue',
        title: 'Marchandise toujours chez un revendeur',
        message: `${what} chez ${c.customerName} depuis ${days} jour${days > 1 ? 's' : ''} (bon ${c.code}, ${fmt(out.reduce((n, i) => n + i.price, 0))}). Retour prévu le ${dateFr(c.dueAt)} : pas encore de nouvelles.`,
        level: 'warning',
        roles: ['admin'],
        userIds: c.handedBy ? [String(c.handedBy)] : [],
        data: { consignmentId: String(c._id), customerId: String(c.customerId), days },
      });
      await this.model(db).updateOne({ _id: c._id }, { $set: { lastReminderAt: now } });
      sent++;
    }
    if (sent) this.notifications.invalidate(db, ['consignments']);
    return sent;
  }

  // ─── Lecture ───

  private view(c: any, now = Date.now()) {
    const out = (c.items || []).filter((i: ConsignmentItem) => i.status === 'out');
    return {
      ...((c.toObject ? c.toObject() : c) as object),
      id: String(c._id),
      daysOut: daysSince(c.createdAt, now),
      overdue: c.status === 'open' && new Date(c.dueAt).getTime() < now,
      outCount: out.length,
      outValue: out.reduce((n: number, i: ConsignmentItem) => n + i.price, 0),
    };
  }

  async list(db: string, filter: { status?: string; customerId?: string } = {}) {
    const q: Record<string, unknown> = {};
    if (filter.status && filter.status !== 'all') q.status = filter.status;
    if (filter.customerId && Types.ObjectId.isValid(filter.customerId)) q.customerId = new Types.ObjectId(filter.customerId);
    const docs = await this.model(db).find(q).sort({ createdAt: -1 }).limit(300).exec();
    return docs.map((d) => this.view(d));
  }

  async get(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Bon de remise introuvable.');
    const c = await this.model(db).findById(id).exec();
    if (!c) throw new NotFoundException('Bon de remise introuvable.');
    return this.view(c);
  }

  /** Chiffres pour l'accueil et le menu : appareils dehors, valeur, en retard */
  async summary(db: string) {
    const open = await this.model(db).find({ status: 'open' }).exec();
    const now = Date.now();
    let units = 0;
    let value = 0;
    let overdueUnits = 0;
    const resellers = new Set<string>();
    for (const c of open) {
      const out = c.items.filter((i) => i.status === 'out');
      units += out.length;
      value += out.reduce((n, i) => n + i.price, 0);
      if (new Date(c.dueAt).getTime() < now) overdueUnits += out.length;
      if (out.length) resellers.add(String(c.customerId));
    }
    return { units, value, overdueUnits, resellers: resellers.size, consignments: open.length };
  }

  /** Bon ouvert qui contient cet appareil (scan d'un N° de série chez un revendeur) */
  async findBySerial(db: string, raw: string) {
    const serial = normalizeSerial(raw || '');
    const unit = await this.units(db).findOne({ serialNumber: serial }).exec();
    if (!unit || unit.status !== UnitStatus.CONSIGNED || !unit.consignmentId) throw new NotFoundException(`L'appareil ${serial} n'est chez aucun revendeur.`);
    return this.get(db, String(unit.consignmentId));
  }

  // ─── Remise de marchandise ───

  private async resolveReseller(db: string, dto: CreateConsignmentDto, country?: string | null) {
    const model = this.customers(db);
    let customer: any = null;
    if (dto.customerId) {
      customer = Types.ObjectId.isValid(dto.customerId) ? await model.findById(dto.customerId) : null;
      if (!customer) throw new BadRequestException('Revendeur introuvable : choisissez-le à nouveau.');
    } else {
      const name = dto.customerName?.trim();
      const rawPhone = dto.customerPhone?.trim();
      if (!name) throw new BadRequestException('Indiquez le nom du revendeur.');
      const phone = rawPhone ? toE164(rawPhone, country) : null;
      if (rawPhone && !phone) throw new BadRequestException(`Le numéro ${rawPhone} n'est pas valide.`);
      customer = phone ? await model.findOne({ phone }) : null;
      if (!customer) customer = await model.create({ name, phone, isReseller: true, idNumber: dto.idNumber?.trim() || null, balance: 0 });
    }
    // Qui reçoit de la marchandise en dépôt est un revendeur ; la pièce d'identité est complétée si elle est donnée
    const set: Record<string, unknown> = {};
    if (!customer.isReseller) set.isReseller = true;
    if (dto.idNumber?.trim() && !customer.idNumber) set.idNumber = dto.idNumber.trim();
    if (Object.keys(set).length) await model.updateOne({ _id: customer._id }, { $set: set });
    return customer;
  }

  async create(db: string, dto: CreateConsignmentDto, actor: Actor, country?: string | null) {
    const serials = [...new Set((dto.serialNumbers || []).map((s) => normalizeSerial(s || '')).filter(Boolean))];
    if (!serials.length) throw new BadRequestException('Scannez au moins un appareil.');
    const customer = await this.resolveReseller(db, dto, country);
    const prices = Object.fromEntries(Object.entries(dto.prices || {}).map(([k, v]) => [normalizeSerial(k), Number(v)]));

    const id = new Types.ObjectId();
    const items: ConsignmentItem[] = [];
    const undo: Array<() => Promise<unknown>> = [];
    const rollback = async () => {
      for (const fn of undo.reverse()) await fn().catch(() => undefined);
    };
    const now = new Date();
    try {
      for (const serial of serials) {
        const before = await this.units(db).findOne({ serialNumber: serial }).exec();
        if (!before) throw new BadRequestException(`Le N° de série ${serial} n'est pas enregistré en stock.`);
        const product: any = await this.products(db).findById(before.productId);
        if (!product) throw new BadRequestException(`Le produit de l'appareil ${serial} n'existe plus.`);
        const price = Math.round(prices[serial] ?? (product.resellerPrice > 0 ? product.resellerPrice : product.salePrice) ?? 0);
        if (!(price > 0)) throw new BadRequestException(`Indiquez le prix convenu pour ${product.name}.`);
        if (actor.role === 'seller' && product.purchasePrice > 0 && price < product.purchasePrice) {
          throw new BadRequestException(`Prix trop bas pour '${product.name}' (en dessous du prix d'achat). Demandez au propriétaire.`);
        }
        // Réservation atomique : seul un appareil en stock peut partir chez un revendeur
        const unit = await this.units(db).findOneAndUpdate(
          { _id: before._id, status: UnitStatus.IN_STOCK },
          { status: UnitStatus.CONSIGNED, consignmentId: id, consignedToName: customer.name, consignedAt: now },
          { new: true },
        );
        if (!unit) {
          throw new BadRequestException(
            before.status === UnitStatus.SOLD
              ? `L'appareil ${serial} a déjà été vendu.`
              : before.status === UnitStatus.CONSIGNED
                ? `L'appareil ${serial} est déjà chez le revendeur ${before.consignedToName || ''}.`.replace('  ', ' ')
                : `L'appareil ${serial} n'est pas disponible (statut : ${before.status}).`,
          );
        }
        undo.push(() => this.units(db).updateOne({ _id: unit._id }, { status: UnitStatus.IN_STOCK, consignmentId: null, consignedToName: null, consignedAt: null }));
        const dec = await this.products(db).findOneAndUpdate({ _id: product._id, stockQuantity: { $gte: 1 } }, { $inc: { stockQuantity: -1 } }, { new: true });
        if (!dec) throw new BadRequestException(`Stock de '${product.name}' incohérent : vérifiez ses appareils.`);
        undo.push(() => this.products(db).updateOne({ _id: product._id }, { $inc: { stockQuantity: 1 } }));
        items.push({ unitId: unit._id as Types.ObjectId, productId: product._id, productName: product.name, serialNumber: serial, price, status: 'out', closedAt: null, closedByName: null, saleId: null, invoiceNumber: null });
      }

      const days = dto.days ?? DEFAULT_CONSIGNMENT_DAYS;
      const number = await nextSequence(this.counters(db), 'consignment', async () => 1000);
      const created = await this.model(db).create({
        _id: id,
        number,
        code: `DR-${number}`,
        customerId: customer._id,
        customerName: customer.name,
        customerPhone: customer.phone || null,
        items,
        dueAt: new Date(now.getTime() + days * DAY),
        days,
        notes: dto.notes?.trim() || null,
        handedBy: new Types.ObjectId(actor.userId),
        handedByName: actor.name,
        status: 'open',
        lastReminderAt: null,
        closedAt: null,
      });

      for (const it of items) {
        await this.movements(db).create({
          productId: it.productId,
          movementType: StockMovementType.OUT,
          quantity: 1,
          referenceType: StockReferenceType.MANUAL,
          referenceId: created.code,
          notes: `Remis au revendeur ${customer.name} (bon ${created.code}) — N° série ${it.serialNumber}, par ${actor.name}`,
        });
      }
      const total = items.reduce((n, i) => n + i.price, 0);
      await this.notifications.notify(db, {
        type: 'consignment.created',
        title: 'Marchandise remise à un revendeur',
        message: `${actor.name} a remis ${items.length === 1 ? items[0].productName : `${items.length} appareils`} à ${customer.name} (${fmt(total)}), retour prévu le ${dateFr(created.dueAt)}.`,
        level: 'info',
        roles: ['admin'],
        actorId: actor.userId,
        data: { consignmentId: String(created._id), customerId: String(customer._id) },
      });
      this.notifications.invalidate(db, ['consignments', 'units', 'products', 'stock', 'dashboard', 'customers']);
      return this.view(created);
    } catch (e) {
      await rollback();
      throw e;
    }
  }

  // ─── Retour du revendeur : vendu (il paie) et / ou rendu (remis en stock) ───

  async settle(db: string, id: string, dto: SettleConsignmentDto, actor: Actor, country?: string | null) {
    const c: any = await this.model(db).findById(Types.ObjectId.isValid(id) ? id : null).exec();
    if (!c) throw new NotFoundException('Bon de remise introuvable.');
    const sold = [...new Set((dto.sold || []).map((s) => normalizeSerial(s)))];
    const returned = [...new Set((dto.returned || []).map((s) => normalizeSerial(s)))];
    if (!sold.length && !returned.length) throw new BadRequestException('Indiquez les appareils vendus ou rapportés.');
    if (sold.some((s) => returned.includes(s))) throw new BadRequestException('Un appareil ne peut pas être à la fois vendu et rapporté.');
    const item = (serial: string) => {
      const it = c.items.find((i: ConsignmentItem) => i.serialNumber === serial);
      if (!it) throw new BadRequestException(`L'appareil ${serial} ne fait pas partie du bon ${c.code}.`);
      if (it.status !== 'out') throw new BadRequestException(`L'appareil ${serial} a déjà été ${it.status === 'sold' ? 'vendu' : 'rendu'} (bon ${c.code}).`);
      return it as ConsignmentItem;
    };
    const soldItems = sold.map(item);
    const returnedItems = returned.map(item);
    const now = new Date();
    let sale: any = null;

    // Vendus : une facture au nom du revendeur, au prix convenu ; l'argent entre dans la caisse de qui encaisse
    if (soldItems.length) {
      sale = await this.sales.create(
        db,
        {
          customerId: String(c.customerId),
          items: soldItems.map((it) => ({ productId: String(it.productId), productName: it.productName, quantity: 1, unitPrice: it.price, serialNumber: it.serialNumber })),
          paymentMethod: (dto.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
          saleType: SaleType.RESELLER,
          depositAmount: dto.depositAmount,
          depositMethod: dto.depositMethod,
          notes: `Vente du revendeur ${c.customerName} (bon ${c.code})`,
        } as any,
        actor,
        { country, consignedSerials: new Set(sold) },
      );
      for (const it of soldItems) Object.assign(it, { status: 'sold', closedAt: now, closedByName: actor.name, saleId: sale._id, invoiceNumber: sale.invoiceNumber });
    }

    // Rendus : l'appareil revient en stock, le lien avec le revendeur est cassé (l'historique reste sur le bon)
    for (const it of returnedItems) {
      const back = await this.units(db).findOneAndUpdate(
        { serialNumber: it.serialNumber, status: UnitStatus.CONSIGNED, consignmentId: c._id },
        { status: UnitStatus.IN_STOCK, consignmentId: null, consignedToName: null, consignedAt: null },
        { new: true },
      );
      if (!back) throw new BadRequestException(`L'appareil ${it.serialNumber} n'est plus chez ${c.customerName}.`);
      await this.products(db).updateOne({ _id: it.productId }, { $inc: { stockQuantity: 1 } });
      await this.movements(db).create({
        productId: it.productId,
        movementType: StockMovementType.IN,
        quantity: 1,
        referenceType: StockReferenceType.MANUAL,
        referenceId: c.code,
        notes: `Rendu par le revendeur ${c.customerName}, remis en stock (bon ${c.code}) — N° série ${it.serialNumber}, reçu par ${actor.name}`,
      });
      Object.assign(it, { status: 'returned', closedAt: now, closedByName: actor.name });
    }

    const stillOut = c.items.filter((i: ConsignmentItem) => i.status === 'out').length;
    await this.model(db).updateOne({ _id: c._id }, { $set: { items: c.items, status: stillOut ? 'open' : 'closed', closedAt: stillOut ? null : now } });

    const parts = [
      soldItems.length && `${soldItems.length} vendu${soldItems.length > 1 ? 's' : ''} (${fmt(soldItems.reduce((n, i) => n + i.price, 0))}, facture #${sale.invoiceNumber})`,
      returnedItems.length && `${returnedItems.length} rendu${returnedItems.length > 1 ? 's' : ''} en stock`,
    ].filter(Boolean);
    await this.notifications.notify(db, {
      type: 'consignment.settled',
      title: 'Retour d\'un revendeur',
      message: `${c.customerName} : ${parts.join(', ')}${stillOut ? ` — encore ${stillOut} appareil${stillOut > 1 ? 's' : ''} chez lui` : ' — bon soldé'}.`,
      level: 'success',
      roles: ['admin'],
      actorId: actor.userId,
      data: { consignmentId: String(c._id) },
    });
    this.notifications.invalidate(db, ['consignments', 'units', 'products', 'stock', 'dashboard', 'customers', 'sales', 'cash-closings']);
    return { consignment: await this.get(db, String(c._id)), sale };
  }
}
