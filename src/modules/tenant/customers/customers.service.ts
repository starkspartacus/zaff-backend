import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { CustomerPayment, CustomerPaymentSchema } from '../common/schemas/customer-payment.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerPaymentDto, UpdateCustomerDto } from './dto/customer-payment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Actor, paymentStatusOf } from '../sales/sales.service';
import { paymentLabel } from '../../../common/enums/payment-labels';
import { toE164 } from '../../../common/geo/geo';

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

@Injectable()
export class CustomersService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private getCustomerModel(db: string) {
    return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema);
  }
  private getSaleModel(db: string) {
    return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema);
  }
  private getPaymentModel(db: string) {
    return this.tenantConnectionService.getModel<CustomerPayment>(db, CustomerPayment.name, CustomerPaymentSchema);
  }

  /** Téléphone au format international (pays de la boutique) ; numéro invalide refusé */
  private phoneOf(raw: string | null | undefined, country?: string | null) {
    const phone = raw?.trim();
    if (!phone) return null;
    const e164 = toE164(phone, country);
    if (!e164) throw new BadRequestException(`Le numéro ${phone} n'est pas valide.`);
    return e164;
  }

  async findAll(db: string, type?: 'resellers' | 'standard' | 'debtors' | 'all') {
    const model = this.getCustomerModel(db);
    const query: any = {};
    if (type === 'resellers') query.isReseller = true;
    else if (type === 'standard') query.isReseller = { $ne: true };
    else if (type === 'debtors') query.balance = { $gt: 0 };
    return model.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(db: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Client non trouvé.');
    const customer = await this.getCustomerModel(db).findById(id).exec();
    if (!customer) throw new NotFoundException('Client non trouvé.');
    const [sales, payments] = await Promise.all([
      this.getSaleModel(db).find({ customerId: customer._id }).sort({ saleDate: -1 }).limit(200).exec(),
      this.getPaymentModel(db).find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(200).exec(),
    ]);
    return { customer, sales, payments };
  }

  async create(db: string, dto: CreateCustomerDto, country?: string | null) {
    const phone = this.phoneOf(dto.phone, country);
    if (phone && (await this.getCustomerModel(db).exists({ phone }))) {
      throw new BadRequestException(`Un client avec le numéro ${phone} existe déjà.`);
    }
    return this.getCustomerModel(db).create({ ...dto, phone, balance: 0 });
  }

  async update(db: string, id: string, dto: UpdateCustomerDto, country?: string | null) {
    const update: any = { ...dto };
    if (dto.phone !== undefined) {
      update.phone = this.phoneOf(dto.phone, country);
      if (update.phone && (await this.getCustomerModel(db).exists({ phone: update.phone, _id: { $ne: new Types.ObjectId(id) } }))) {
        throw new BadRequestException(`Un autre client utilise déjà le numéro ${update.phone}.`);
      }
    }
    const updated = await this.getCustomerModel(db).findByIdAndUpdate(id, update, { new: true }).exec();
    if (!updated) throw new NotFoundException('Client non trouvé.');
    return updated;
  }

  async remove(db: string, id: string) {
    const model = this.getCustomerModel(db);
    const customer = await model.findById(id);
    if (!customer) throw new NotFoundException('Client non trouvé.');
    if ((customer.balance || 0) > 0) {
      throw new BadRequestException(`${customer.name} doit encore ${fmt(customer.balance)} : il ne peut pas être supprimé.`);
    }
    await model.deleteOne({ _id: customer._id });
    return { message: 'Client supprimé.' };
  }

  /**
   * Paiement d'un client à crédit (revendeur) : la dette baisse (jamais sous zéro), les ventes les plus
   * anciennes sont soldées d'abord, l'argent entre dans la caisse de celui qui l'encaisse.
   */
  async addPayment(db: string, id: string, dto: CustomerPaymentDto, actor: Actor) {
    const model = this.getCustomerModel(db);
    const saleModel = this.getSaleModel(db);
    const amount = Math.round(dto.amount);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Client non trouvé.');
    const customer = await model.findById(id);
    if (!customer) throw new NotFoundException('Client non trouvé.');
    if ((customer.balance || 0) <= 0) throw new BadRequestException(`${customer.name} ne doit rien.`);
    if (amount > customer.balance) {
      throw new BadRequestException(`${customer.name} doit ${fmt(customer.balance)} : vous ne pouvez pas encaisser ${fmt(amount)}.`);
    }

    // Débit atomique de la dette
    const debited = await model.findOneAndUpdate({ _id: customer._id, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
    if (!debited) throw new BadRequestException('Le solde de ce client vient de changer, réessayez.');

    // Répartition sur les ventes à crédit, des plus anciennes aux plus récentes
    const allocations: Array<{ saleId: Types.ObjectId; invoiceNumber: number; amount: number }> = [];
    let rest = amount;
    const open = await saleModel.find({ customerId: customer._id, amountDue: { $gt: 0 } }).sort({ saleDate: 1 }).exec();
    for (const sale of open) {
      if (rest <= 0) break;
      const take = Math.min(rest, sale.amountDue);
      const updated = await saleModel.findOneAndUpdate({ _id: sale._id, amountDue: { $gte: take } }, { $inc: { amountDue: -take } }, { new: true });
      if (!updated) continue;
      await saleModel.updateOne(
        { _id: sale._id },
        { $set: { paymentStatus: paymentStatusOf(updated.total - (updated.creditNoteAmount || 0), updated.amountDue), paidAmount: (updated.paidAmount || 0) + take } },
      );
      allocations.push({ saleId: sale._id as Types.ObjectId, invoiceNumber: sale.invoiceNumber, amount: take });
      rest -= take;
    }

    const payment = await this.getPaymentModel(db).create({
      customerId: customer._id,
      customerName: customer.name,
      amount,
      method: dto.method || 'cash',
      kind: 'payment',
      allocations,
      notes: dto.notes || null,
      collectedBy: new Types.ObjectId(actor.userId),
      collectedByName: actor.name,
      closingId: null,
    });

    await this.notifications.notify(db, {
      type: 'customer.payment',
      title: 'Paiement reçu',
      message: `${actor.name} a encaissé ${fmt(amount)} de ${customer.name} (${paymentLabel(dto.method || 'cash')}). Reste dû : ${fmt(debited.balance)}.`,
      level: 'success',
      roles: ['admin'],
      actorId: actor.userId,
      data: { customerId: String(customer._id), amount, balance: debited.balance },
    });
    this.notifications.invalidate(db, ['customers', 'sales', 'cash-closings', 'dashboard', 'my-stats']);
    return { payment, balance: debited.balance };
  }
}
