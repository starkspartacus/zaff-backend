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
exports.SuppliersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const suppliers_service_1 = require("./suppliers.service");
const create_supplier_dto_1 = require("./dto/create-supplier.dto");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const current_tenant_decorator_1 = require("../../../common/decorators/current-tenant.decorator");
let SuppliersController = class SuppliersController {
    constructor(suppliersService) {
        this.suppliersService = suppliersService;
    }
    getSuppliers(db) {
        return this.suppliersService.getSuppliers(db);
    }
    createSupplier(db, dto) {
        return this.suppliersService.createSupplier(db, dto);
    }
    updateSupplier(db, id, dto) {
        return this.suppliersService.updateSupplier(db, id, dto);
    }
    getOrders(db) {
        return this.suppliersService.getOrders(db);
    }
    createOrder(db, dto) {
        return this.suppliersService.createOrder(db, dto);
    }
    receiveOrder(db, id) {
        return this.suppliersService.receiveOrder(db, id);
    }
};
exports.SuppliersController = SuppliersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les fournisseurs' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "getSuppliers", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Ajouter un fournisseur' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_supplier_dto_1.CreateSupplierDto]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Mettre à jour un fournisseur' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "updateSupplier", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les commandes d\'approvisionnement' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, swagger_1.ApiOperation)({ summary: 'Créer une commande d\'achat' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_supplier_dto_1.CreatePurchaseOrderDto]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Patch)('orders/:id/receive'),
    (0, swagger_1.ApiOperation)({ summary: 'Valider la réception de commande (Incrémente automatiquement le stock)' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "receiveOrder", null);
exports.SuppliersController = SuppliersController = __decorate([
    (0, swagger_1.ApiTags)('Tenant - Suppliers & Orders'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    (0, common_1.Controller)('suppliers'),
    __metadata("design:paramtypes", [suppliers_service_1.SuppliersService])
], SuppliersController);
//# sourceMappingURL=suppliers.controller.js.map