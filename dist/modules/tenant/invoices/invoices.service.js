"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const sale_schema_1 = require("../common/schemas/sale.schema");
const sale_return_schema_1 = require("../common/schemas/sale-return.schema");
let InvoicesService = class InvoicesService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getSaleModel(db) { return this.tenantConnectionService.getModel(db, sale_schema_1.Sale.name, sale_schema_1.SaleSchema); }
    getSaleReturnModel(db) { return this.tenantConnectionService.getModel(db, sale_return_schema_1.SaleReturn.name, sale_return_schema_1.SaleReturnSchema); }
    async getInvoices(db, range, startStr, endStr) {
        const model = this.getSaleModel(db);
        const query = {};
        const now = new Date();
        if (range === 'today') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            query.saleDate = { $gte: start };
        }
        else if (range === 'week') {
            const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query.saleDate = { $gte: start };
        }
        else if (range === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            query.saleDate = { $gte: start };
        }
        else if (range === 'year') {
            const start = new Date(now.getFullYear(), 0, 1);
            query.saleDate = { $gte: start };
        }
        else if (startStr && endStr) {
            query.saleDate = { $gte: new Date(startStr), $lte: new Date(endStr) };
        }
        return model.find(query).populate('customerId').sort({ invoiceNumber: -1 }).exec();
    }
    async getInvoiceData(db, invoiceNumber) {
        const model = this.getSaleModel(db);
        const sale = await model.findOne({ invoiceNumber }).populate('customerId').exec();
        if (!sale)
            throw new common_1.NotFoundException(`Facture #${invoiceNumber} non trouvée.`);
        const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
        return { sale, returns };
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map