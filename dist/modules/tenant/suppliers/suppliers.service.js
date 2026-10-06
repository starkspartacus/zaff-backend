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
exports.SuppliersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const supplier_schema_1 = require("../common/schemas/supplier.schema");
const purchase_order_schema_1 = require("../common/schemas/purchase-order.schema");
const product_schema_1 = require("../common/schemas/product.schema");
const stock_movement_schema_1 = require("../common/schemas/stock-movement.schema");
const stock_movement_enum_1 = require("../../../common/enums/stock-movement.enum");
const purchase_order_status_enum_1 = require("../../../common/enums/purchase-order-status.enum");
let SuppliersService = class SuppliersService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getSupplierModel(db) { return this.tenantConnectionService.getModel(db, supplier_schema_1.Supplier.name, supplier_schema_1.SupplierSchema); }
    getOrderModel(db) { return this.tenantConnectionService.getModel(db, purchase_order_schema_1.PurchaseOrder.name, purchase_order_schema_1.PurchaseOrderSchema); }
    getProductModel(db) { return this.tenantConnectionService.getModel(db, product_schema_1.Product.name, product_schema_1.ProductSchema); }
    getStockMovementModel(db) { return this.tenantConnectionService.getModel(db, stock_movement_schema_1.StockMovement.name, stock_movement_schema_1.StockMovementSchema); }
    async getSuppliers(db) {
        return this.getSupplierModel(db).find().sort({ name: 1 }).exec();
    }
    async createSupplier(db, dto) {
        return this.getSupplierModel(db).create(dto);
    }
    async updateSupplier(db, id, dto) {
        const res = await this.getSupplierModel(db).findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!res)
            throw new common_1.NotFoundException('Fournisseur non trouvé.');
        return res;
    }
    async getOrders(db) {
        return this.getOrderModel(db).find().populate('supplierId').populate('items.productId').sort({ orderDate: -1 }).exec();
    }
    async createOrder(db, dto) {
        const orderModel = this.getOrderModel(db);
        return orderModel.create({
            supplierId: new mongoose_1.Types.ObjectId(dto.supplierId),
            status: dto.status || purchase_order_status_enum_1.PurchaseOrderStatus.PENDING,
            totalAmount: dto.totalAmount,
            items: dto.items.map((i) => ({ ...i, productId: new mongoose_1.Types.ObjectId(i.productId) })),
            notes: dto.notes || null,
        });
    }
    async receiveOrder(db, orderId) {
        const orderModel = this.getOrderModel(db);
        const prodModel = this.getProductModel(db);
        const movModel = this.getStockMovementModel(db);
        const order = await orderModel.findById(orderId);
        if (!order)
            throw new common_1.NotFoundException('Commande non trouvée.');
        if (order.status === purchase_order_status_enum_1.PurchaseOrderStatus.RECEIVED)
            return order;
        for (const item of order.items) {
            const product = await prodModel.findById(item.productId);
            if (product) {
                product.stockQuantity += item.quantity;
                await product.save();
                await movModel.create({
                    productId: product._id,
                    movementType: stock_movement_enum_1.StockMovementType.IN,
                    quantity: item.quantity,
                    referenceType: stock_movement_enum_1.StockReferenceType.PURCHASE,
                    referenceId: String(order._id),
                    notes: `Réception bon de commande fournisseur`,
                });
            }
        }
        order.status = purchase_order_status_enum_1.PurchaseOrderStatus.RECEIVED;
        await order.save();
        return order;
    }
};
exports.SuppliersService = SuppliersService;
exports.SuppliersService = SuppliersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], SuppliersService);
//# sourceMappingURL=suppliers.service.js.map