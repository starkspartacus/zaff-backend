import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Repair, RepairSchema } from '../common/schemas/repair.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { RepairStatus } from '../../../common/enums/repair-status.enum';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface RepairFromReturn {
  customerId: Types.ObjectId | null;
  productId: Types.ObjectId;
  unitId: Types.ObjectId;
  saleId: Types.ObjectId;
  returnId: Types.ObjectId;
  deviceName: string;
  serialNumber: string;
  issueDescription: string;
  underWarranty: boolean;
  ownership: 'customer' | 'shop';
}
import { CreateRepairDto } from './dto/create-repair.dto';

@Injectable()
export class RepairsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private getModel(db: string) { return this.tenantConnectionService.getModel<Repair>(db, Repair.name, RepairSchema); }
  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }

  async findAll(db: string, status?: string) {
    const query: any = {};
    if (status && status !== 'all') query.status = status;
    return this.getModel(db).find(query).populate('customerId').sort({ receivedDate: -1 }).exec();
  }

  async findById(db: string, id: string) {
    const repair = await this.getModel(db).findById(id).populate('customerId').exec();
    if (!repair) throw new NotFoundException('Dossier de réparation non trouvé.');
    return repair;
  }

  async create(db: string, dto: CreateRepairDto) {
    const model = this.getModel(db);
    const { customerName, customerPhone, ...data } = dto;

    // Client existant, retrouvé par téléphone, ou créé à la volée
    let customerId: Types.ObjectId;
    if (dto.customerId) {
      customerId = new Types.ObjectId(dto.customerId);
    } else if (customerName || customerPhone) {
      const custModel = this.getCustomerModel(db);
      const existing = customerPhone ? await custModel.findOne({ phone: customerPhone }) : null;
      const customer = existing || (await custModel.create({ name: customerName || customerPhone, phone: customerPhone || null }));
      customerId = customer._id as Types.ObjectId;
    } else {
      throw new BadRequestException('Un client (customerId ou nom / téléphone) est requis.');
    }

    const ticketNumber = await this.nextTicketNumber(db);

    const repair = await model.create({
      ...data,
      ticketNumber,
      customerId,
      productId: dto.productId ? new Types.ObjectId(dto.productId) : null,
    });
    return repair.populate('customerId');
  }

  /** Numéro de ticket séquentiel propre à l'établissement */
  private async nextTicketNumber(db: string) {
    const last = await this.getModel(db).findOne().sort({ ticketNumber: -1 }).exec();
    return last && last.ticketNumber ? last.ticketNumber + 1 : 1001;
  }

  /** Ticket SAV ouvert automatiquement par un retour défectueux (appareil identifié par son N° de série) */
  async createFromReturn(db: string, data: RepairFromReturn) {
    return this.getModel(db).create({
      ...data,
      ticketNumber: await this.nextTicketNumber(db),
      status: RepairStatus.RECEIVED,
      estimatedCost: data.underWarranty ? 0 : null,
      laborCost: 0,
      partsCost: 0,
      receivedDate: new Date(),
    });
  }

  async update(db: string, id: string, dto: Partial<CreateRepairDto>) {
    const model = this.getModel(db);
    const update: any = { ...dto };
    if (dto.status === RepairStatus.COMPLETED) update.completedDate = new Date();
    const repair = await model.findByIdAndUpdate(id, update, { new: true }).populate('customerId').exec();
    if (!repair) throw new NotFoundException('Dossier de réparation non trouvé.');

    // Appareil du client rendu après réparation : il redevient « vendu » (toujours hors stock)
    if (repair.unitId && repair.ownership === 'customer' && dto.status === RepairStatus.RETURNED) {
      await this.getUnitModel(db).updateOne({ _id: repair.unitId, status: UnitStatus.IN_REPAIR }, { $set: { status: UnitStatus.SOLD } });
      this.notifications.invalidate(db, ['units']);
    }
    // Appareil repris par la boutique et réparé : il peut être remis en vente depuis « Numéros de série »
    if (repair.unitId && repair.ownership === 'shop' && dto.status === RepairStatus.COMPLETED) {
      await this.notifications.notify(db, {
        type: 'repair.ready',
        title: 'Appareil réparé',
        message: `${repair.deviceName} (${repair.serialNumber}) est réparé : il peut être remis en vente.`,
        level: 'success',
        roles: ['admin', 'storekeeper'],
        data: { repairId: String(repair._id), serialNumber: repair.serialNumber },
      });
    }
    return repair;
  }

  async remove(db: string, id: string) {
    const model = this.getModel(db);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Dossier de réparation non trouvé.');
    return { message: 'Dossier SAV supprimé.' };
  }
}
