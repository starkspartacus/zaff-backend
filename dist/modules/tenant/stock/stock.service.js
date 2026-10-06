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
exports.StockService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const stock_movement_schema_1 = require("../common/schemas/stock-movement.schema");
const product_schema_1 = require("../common/schemas/product.schema");
const stock_movement_enum_1 = require("../../../common/enums/stock-movement.enum");
let StockService = class StockService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getStockMovementModel(db) {
        return this.tenantConnectionService.getModel(db, stock_movement_schema_1.StockMovement.name, stock_movement_schema_1.StockMovementSchema);
    }
    getProductModel(db) {
        return this.tenantConnectionService.getModel(db, product_schema_1.Product.name, product_schema_1.ProductSchema);
    }
    async getOverview(db) {
        const prodModel = this.getProductModel(db);
        const products = await prodModel.find().sort({ stockQuantity: 1 }).exec();
        const lowStock = products.filter((p) => p.stockQuantity <= p.minStockAlert);
        return {
            totalProducts: products.length,
            lowStockCount: lowStock.length,
            lowStockProducts: lowStock,
            products,
        };
    }
    async getMovements(db, limit = 100) {
        const movModel = this.getStockMovementModel(db);
        return movModel.find().populate('productId').sort({ createdAt: -1 }).limit(limit).exec();
    }
    async createMovement(db, dto) {
        const prodModel = this.getProductModel(db);
        const movModel = this.getStockMovementModel(db);
        const product = await prodModel.findById(dto.productId);
        if (!product)
            throw new common_1.NotFoundException('Produit non trouvé.');
        let stockChange = 0;
        if (dto.movementType === stock_movement_enum_1.StockMovementType.IN) {
            stockChange = dto.quantity;
        }
        else if (dto.movementType === stock_movement_enum_1.StockMovementType.OUT) {
            if (product.stockQuantity < dto.quantity) {
                throw new common_1.BadRequestException(`Stock insuffisant (Disponible: ${product.stockQuantity}).`);
            }
            stockChange = -dto.quantity;
        }
        else if (dto.movementType === stock_movement_enum_1.StockMovementType.ADJUSTMENT) {
            stockChange = dto.quantity - product.stockQuantity;
        }
        product.stockQuantity += stockChange;
        await product.save();
        const movement = await movModel.create({
            productId: new mongoose_1.Types.ObjectId(dto.productId),
            movementType: dto.movementType,
            quantity: Math.abs(dto.quantity),
            referenceType: dto.referenceType,
            referenceId: dto.referenceId || null,
            notes: dto.notes || null,
        });
        return { movement, currentStock: product.stockQuantity };
    }
};
exports.StockService = StockService;
exports.StockService = StockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], StockService);
//# sourceMappingURL=stock.service.js.map