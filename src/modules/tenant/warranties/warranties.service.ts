import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { CreateWarrantyDto } from './dto/create-warranty.dto';

@Injectable()
export class WarrantiesService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }

  async findAll(db: string, status?: string) {
    const query: any = {};
    if (status && status !== 'all') query.status = status;
    return this.getModel(db).find(query).populate('customerId').sort({ warrantyEnd: 1 }).exec();
  }

  async create(db: string, dto: CreateWarrantyDto) {
    const model = this.getModel(db);
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + (dto.warrantyDurationMonths || 12));

    return model.create({
      saleId: dto.saleId ? new Types.ObjectId(dto.saleId) : null,
      customerId: new Types.ObjectId(dto.customerId),
      productId: dto.productId ? new Types.ObjectId(dto.productId) : null,
      productName: dto.productName,
      serialNumber: dto.serialNumber || null,
      warrantyStart: start,
      warrantyDurationMonths: dto.warrantyDurationMonths || 12,
      warrantyEnd: end,
      status: dto.status || 'active',
      notes: dto.notes || null,
    });
  }

  async update(db: string, id: string, dto: Partial<CreateWarrantyDto>) {
    const model = this.getModel(db);
    const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!updated) throw new NotFoundException('Garantie non trouvée.');
    return updated;
  }
}
