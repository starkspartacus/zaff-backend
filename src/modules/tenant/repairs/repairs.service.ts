import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Repair, RepairSchema } from '../common/schemas/repair.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { RepairStatus } from '../../../common/enums/repair-status.enum';
import { CreateRepairDto } from './dto/create-repair.dto';

@Injectable()
export class RepairsService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getModel(db: string) { return this.tenantConnectionService.getModel<Repair>(db, Repair.name, RepairSchema); }
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

    // Numéro de ticket séquentiel propre à l'établissement
    const last = await model.findOne().sort({ ticketNumber: -1 }).exec();
    const ticketNumber = last && last.ticketNumber ? last.ticketNumber + 1 : 1001;

    const repair = await model.create({
      ...data,
      ticketNumber,
      customerId,
      productId: dto.productId ? new Types.ObjectId(dto.productId) : null,
    });
    return repair.populate('customerId');
  }

  async update(db: string, id: string, dto: Partial<CreateRepairDto>) {
    const model = this.getModel(db);
    const update: any = { ...dto };
    if (dto.status === RepairStatus.COMPLETED) update.completedDate = new Date();
    const repair = await model.findByIdAndUpdate(id, update, { new: true }).populate('customerId').exec();
    if (!repair) throw new NotFoundException('Dossier de réparation non trouvé.');
    return repair;
  }

  async remove(db: string, id: string) {
    const model = this.getModel(db);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Dossier de réparation non trouvé.');
    return { message: 'Dossier SAV supprimé.' };
  }
}
