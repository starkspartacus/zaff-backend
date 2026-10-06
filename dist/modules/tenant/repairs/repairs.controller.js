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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const repairs_service_1 = require("./repairs.service");
const create_repair_dto_1 = require("./dto/create-repair.dto");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const current_tenant_decorator_1 = require("../../../common/decorators/current-tenant.decorator");
let RepairsController = class RepairsController {
    constructor(repairsService) {
        this.repairsService = repairsService;
    }
    findAll(db, status) {
        return this.repairsService.findAll(db, status);
    }
    findOne(db, id) {
        return this.repairsService.findById(db, id);
    }
    create(db, dto) {
        return this.repairsService.create(db, dto);
    }
    update(db, id, dto) {
        return this.repairsService.update(db, id, dto);
    }
    remove(db, id) {
        return this.repairsService.remove(db, id);
    }
};
exports.RepairsController = RepairsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les dossiers SAV / Réparations' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RepairsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Détails d\'une réparation' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RepairsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Ouvrir un nouveau dossier de réparation' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_repair_dto_1.CreateRepairDto]),
    __metadata("design:returntype", void 0)
], RepairsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Mettre à jour un dossier SAV (statut, coûts, diagnostic)' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], RepairsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Supprimer un dossier SAV' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RepairsController.prototype, "remove", null);
exports.RepairsController = RepairsController = __decorate([
    (0, swagger_1.ApiTags)('Tenant - Repairs (SAV)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    (0, common_1.Controller)('repairs'),
    __metadata("design:paramtypes", [repairs_service_1.RepairsService])
], RepairsController);
//# sourceMappingURL=repairs.controller.js.map