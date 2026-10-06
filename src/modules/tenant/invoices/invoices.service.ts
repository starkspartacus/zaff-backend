import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { SaleReturn, SaleReturnSchema } from '../common/schemas/sale-return.schema';

@Injectable()
export class InvoicesService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getSaleReturnModel(db: string) { return this.tenantConnectionService.getModel<SaleReturn>(db, SaleReturn.name, SaleReturnSchema); }

  async getInvoices(db: string, range?: string, startStr?: string, endStr?: string) {
    const model = this.getSaleModel(db);
    const query: any = {};
    const now = new Date();

    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query.saleDate = { $gte: start };
    } else if (range === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query.saleDate = { $gte: start };
    } else if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      query.saleDate = { $gte: start };
    } else if (range === 'year') {
      const start = new Date(now.getFullYear(), 0, 1);
      query.saleDate = { $gte: start };
    } else if (startStr && endStr) {
      query.saleDate = { $gte: new Date(startStr), $lte: new Date(endStr) };
    }

    return model.find(query).populate('customerId').sort({ invoiceNumber: -1 }).exec();
  }

  async getInvoiceData(db: string, invoiceNumber: number) {
    const model = this.getSaleModel(db);
    const sale = await model.findOne({ invoiceNumber }).populate('customerId').exec();
    if (!sale) throw new NotFoundException(`Facture #${invoiceNumber} non trouvée.`);
    const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
    return { sale, returns };
  }
}
