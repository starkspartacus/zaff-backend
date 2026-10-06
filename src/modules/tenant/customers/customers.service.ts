import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getCustomerModel(db: string) {
    return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema);
  }
  private getSaleModel(db: string) {
    return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema);
  }

  async findAll(db: string, type?: 'resellers' | 'standard' | 'all') {
    const model = this.getCustomerModel(db);
    const query: any = {};
    if (type === 'resellers') query.isReseller = true;
    else if (type === 'standard') query.isReseller = { $ne: true };
    return model.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(db: string, id: string) {
    const customer = await this.getCustomerModel(db).findById(id).exec();
    if (!customer) throw new NotFoundException('Client non trouvé.');
    const sales = await this.getSaleModel(db).find({ customerId: customer._id }).sort({ saleDate: -1 }).exec();
    return { customer, sales };
  }

  async create(db: string, dto: CreateCustomerDto) {
    const model = this.getCustomerModel(db);
    return model.create(dto);
  }

  async update(db: string, id: string, dto: Partial<CreateCustomerDto>) {
    const model = this.getCustomerModel(db);
    const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!updated) throw new NotFoundException('Client non trouvé.');
    return updated;
  }

  async remove(db: string, id: string) {
    const model = this.getCustomerModel(db);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Client non trouvé.');
    return { message: 'Client supprimé.' };
  }
}
