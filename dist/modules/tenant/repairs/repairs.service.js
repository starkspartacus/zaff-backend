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
exports.RepairsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const repair_schema_1 = require("../common/schemas/repair.schema");
let RepairsService = class RepairsService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getModel(db) { return this.tenantConnectionService.getModel(db, repair_schema_1.Repair.name, repair_schema_1.RepairSchema); }
    async findAll(db, status) {
        const query = {};
        if (status && status !== 'all')
            query.status = status;
        return this.getModel(db).find(query).populate('customerId').sort({ receivedDate: -1 }).exec();
    }
    async findById(db, id) {
        const repair = await this.getModel(db).findById(id).populate('customerId').exec();
        if (!repair)
            throw new common_1.NotFoundException('Dossier de réparation non trouvé.');
        return repair;
    }
    async create(db, dto) {
        const model = this.getModel(db);
        return model.create({
            ...dto,
            customerId: new mongoose_1.Types.ObjectId(dto.customerId),
            productId: dto.productId ? new mongoose_1.Types.ObjectId(dto.productId) : null,
        });
    }
    async update(db, id, dto) {
        const model = this.getModel(db);
        const repair = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!repair)
            throw new common_1.NotFoundException('Dossier de réparation non trouvé.');
        return repair;
    }
    async remove(db, id) {
        const model = this.getModel(db);
        const res = await model.findByIdAndDelete(id).exec();
        if (!res)
            throw new common_1.NotFoundException('Dossier de réparation non trouvé.');
        return { message: 'Dossier SAV supprimé.' };
    }
};
exports.RepairsService = RepairsService;
exports.RepairsService = RepairsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], RepairsService);
//# sourceMappingURL=repairs.service.js.map