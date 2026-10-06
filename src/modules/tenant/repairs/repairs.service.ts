import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Repair, RepairSchema } from '../common/schemas/repair.schema';
import { CreateRepairDto } from './dto/create-repair.dto';

@Injectable()
export class RepairsService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getModel(db: string) { return this.tenantConnectionService.getModel<Repair>(db, Repair.name, RepairSchema); }

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
    return model.create({
      ...dto,
      customerId: new Types.ObjectId(dto.customerId),
      productId: dto.productId ? new Types.ObjectId(dto.productId) : null,
    });
  }

  async update(db: string, id: string, dto: Partial<CreateRepairDto>) {
    const model = this.getModel(db);
    const repair = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
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
