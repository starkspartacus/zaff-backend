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
exports.WarrantiesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const warranty_schema_1 = require("../common/schemas/warranty.schema");
let WarrantiesService = class WarrantiesService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getModel(db) { return this.tenantConnectionService.getModel(db, warranty_schema_1.Warranty.name, warranty_schema_1.WarrantySchema); }
    async findAll(db, status) {
        const query = {};
        if (status && status !== 'all')
            query.status = status;
        return this.getModel(db).find(query).populate('customerId').sort({ warrantyEnd: 1 }).exec();
    }
    async create(db, dto) {
        const model = this.getModel(db);
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + (dto.warrantyDurationMonths || 12));
        return model.create({
            saleId: dto.saleId ? new mongoose_1.Types.ObjectId(dto.saleId) : null,
            customerId: new mongoose_1.Types.ObjectId(dto.customerId),
            productId: dto.productId ? new mongoose_1.Types.ObjectId(dto.productId) : null,
            productName: dto.productName,
            serialNumber: dto.serialNumber || null,
            warrantyStart: start,
            warrantyDurationMonths: dto.warrantyDurationMonths || 12,
            warrantyEnd: end,
            status: dto.status || 'active',
            notes: dto.notes || null,
        });
    }
    async update(db, id, dto) {
        const model = this.getModel(db);
        const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!updated)
            throw new common_1.NotFoundException('Garantie non trouvée.');
        return updated;
    }
};
exports.WarrantiesService = WarrantiesService;
exports.WarrantiesService = WarrantiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], WarrantiesService);
//# sourceMappingURL=warranties.service.js.map