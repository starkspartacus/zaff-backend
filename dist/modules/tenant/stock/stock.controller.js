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
exports.StockController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const stock_service_1 = require("./stock.service");
const create_stock_movement_dto_1 = require("./dto/create-stock-movement.dto");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const current_tenant_decorator_1 = require("../../../common/decorators/current-tenant.decorator");
let StockController = class StockController {
    constructor(stockService) {
        this.stockService = stockService;
    }
    getOverview(db) {
        return this.stockService.getOverview(db);
    }
    getMovements(db, limit) {
        return this.stockService.getMovements(db, limit ? Number(limit) : 100);
    }
    createMovement(db, dto) {
        return this.stockService.createMovement(db, dto);
    }
};
exports.StockController = StockController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: 'Aperçu du stock et alertes' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StockController.prototype, "getOverview", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, swagger_1.ApiOperation)({ summary: 'Historique des mouvements de stock' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", void 0)
], StockController.prototype, "getMovements", null);
__decorate([
    (0, common_1.Post)('movements'),
    (0, swagger_1.ApiOperation)({ summary: 'Enregistrer une entrée/sortie/ajustement de stock' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_stock_movement_dto_1.CreateStockMovementDto]),
    __metadata("design:returntype", void 0)
], StockController.prototype, "createMovement", null);
exports.StockController = StockController = __decorate([
    (0, swagger_1.ApiTags)('Tenant - Stock'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    (0, common_1.Controller)('stock'),
    __metadata("design:paramtypes", [stock_service_1.StockService])
], StockController);
//# sourceMappingURL=stock.controller.js.map