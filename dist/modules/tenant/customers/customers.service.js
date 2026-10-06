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
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const customer_schema_1 = require("../common/schemas/customer.schema");
const sale_schema_1 = require("../common/schemas/sale.schema");
let CustomersService = class CustomersService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getCustomerModel(db) {
        return this.tenantConnectionService.getModel(db, customer_schema_1.Customer.name, customer_schema_1.CustomerSchema);
    }
    getSaleModel(db) {
        return this.tenantConnectionService.getModel(db, sale_schema_1.Sale.name, sale_schema_1.SaleSchema);
    }
    async findAll(db, type) {
        const model = this.getCustomerModel(db);
        const query = {};
        if (type === 'resellers')
            query.isReseller = true;
        else if (type === 'standard')
            query.isReseller = { $ne: true };
        return model.find(query).sort({ createdAt: -1 }).exec();
    }
    async findById(db, id) {
        const customer = await this.getCustomerModel(db).findById(id).exec();
        if (!customer)
            throw new common_1.NotFoundException('Client non trouvé.');
        const sales = await this.getSaleModel(db).find({ customerId: customer._id }).sort({ saleDate: -1 }).exec();
        return { customer, sales };
    }
    async create(db, dto) {
        const model = this.getCustomerModel(db);
        return model.create(dto);
    }
    async update(db, id, dto) {
        const model = this.getCustomerModel(db);
        const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!updated)
            throw new common_1.NotFoundException('Client non trouvé.');
        return updated;
    }
    async remove(db, id) {
        const model = this.getCustomerModel(db);
        const res = await model.findByIdAndDelete(id).exec();
        if (!res)
            throw new common_1.NotFoundException('Client non trouvé.');
        return { message: 'Client supprimé.' };
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map