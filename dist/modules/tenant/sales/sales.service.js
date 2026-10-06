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
exports.SalesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const sale_schema_1 = require("../common/schemas/sale.schema");
const sale_return_schema_1 = require("../common/schemas/sale-return.schema");
const product_schema_1 = require("../common/schemas/product.schema");
const customer_schema_1 = require("../common/schemas/customer.schema");
const stock_movement_schema_1 = require("../common/schemas/stock-movement.schema");
const warranty_schema_1 = require("../common/schemas/warranty.schema");
const stock_movement_enum_1 = require("../../../common/enums/stock-movement.enum");
let SalesService = class SalesService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getSaleModel(db) { return this.tenantConnectionService.getModel(db, sale_schema_1.Sale.name, sale_schema_1.SaleSchema); }
    getSaleReturnModel(db) { return this.tenantConnectionService.getModel(db, sale_return_schema_1.SaleReturn.name, sale_return_schema_1.SaleReturnSchema); }
    getProductModel(db) { return this.tenantConnectionService.getModel(db, product_schema_1.Product.name, product_schema_1.ProductSchema); }
    getCustomerModel(db) { return this.tenantConnectionService.getModel(db, customer_schema_1.Customer.name, customer_schema_1.CustomerSchema); }
    getStockMovementModel(db) { return this.tenantConnectionService.getModel(db, stock_movement_schema_1.StockMovement.name, stock_movement_schema_1.StockMovementSchema); }
    getWarrantyModel(db) { return this.tenantConnectionService.getModel(db, warranty_schema_1.Warranty.name, warranty_schema_1.WarrantySchema); }
    async findAll(db) {
        return this.getSaleModel(db).find().populate('customerId').sort({ saleDate: -1 }).exec();
    }
    async findById(db, id) {
        const sale = await this.getSaleModel(db).findById(id).populate('customerId').exec();
        if (!sale)
            throw new common_1.NotFoundException('Vente non trouvée.');
        const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
        return { sale, returns };
    }
    async create(db, dto) {
        const saleModel = this.getSaleModel(db);
        const prodModel = this.getProductModel(db);
        const custModel = this.getCustomerModel(db);
        const movModel = this.getStockMovementModel(db);
        const warModel = this.getWarrantyModel(db);
        const lastSale = await saleModel.findOne().sort({ invoiceNumber: -1 }).exec();
        const nextInvoiceNumber = lastSale && lastSale.invoiceNumber ? lastSale.invoiceNumber + 1 : 1001;
        let customerId = null;
        if (dto.customerId) {
            customerId = new mongoose_1.Types.ObjectId(dto.customerId);
        }
        else if (dto.customerName || dto.customerPhone) {
            const newCust = await custModel.create({
                name: dto.customerName || dto.customerPhone,
                phone: dto.customerPhone || null,
                isReseller: dto.saleType === 'reseller',
            });
            customerId = newCust._id;
        }
        for (const item of dto.items) {
            const product = await prodModel.findById(item.productId);
            if (!product)
                throw new common_1.NotFoundException(`Produit '${item.productName}' non trouvé.`);
            if (product.stockQuantity < item.quantity) {
                throw new common_1.BadRequestException(`Stock insuffisant pour '${product.name}' (Dispo: ${product.stockQuantity}).`);
            }
            product.stockQuantity -= item.quantity;
            await product.save();
            await movModel.create({
                productId: product._id,
                movementType: stock_movement_enum_1.StockMovementType.OUT,
                quantity: item.quantity,
                referenceType: stock_movement_enum_1.StockReferenceType.SALE,
                referenceId: String(nextInvoiceNumber),
                notes: `Vente #${nextInvoiceNumber}`,
            });
        }
        const sale = await saleModel.create({
            invoiceNumber: nextInvoiceNumber,
            customerId,
            saleDate: new Date(),
            subtotal: dto.subtotal,
            discount: dto.discount || 0,
            total: dto.total,
            paymentMethod: dto.paymentMethod,
            saleType: dto.saleType,
            items: dto.items.map((i) => ({
                ...i,
                productId: new mongoose_1.Types.ObjectId(i.productId),
            })),
            notes: dto.notes || null,
        });
        if (customerId) {
            await custModel.findByIdAndUpdate(customerId, { $inc: { totalPurchases: dto.total } });
        }
        for (const item of dto.items) {
            if (item.warrantyEnabled && customerId) {
                const months = item.warrantyMonths || 12;
                const start = new Date();
                const end = new Date(start);
                end.setMonth(end.getMonth() + months);
                await warModel.create({
                    saleId: sale._id,
                    customerId,
                    productId: new mongoose_1.Types.ObjectId(item.productId),
                    productName: item.productName,
                    serialNumber: item.serialNumber || null,
                    warrantyStart: start,
                    warrantyDurationMonths: months,
                    warrantyEnd: end,
                });
            }
        }
        return sale;
    }
    async returnItems(db, saleId, dto) {
        const saleModel = this.getSaleModel(db);
        const returnModel = this.getSaleReturnModel(db);
        const prodModel = this.getProductModel(db);
        const movModel = this.getStockMovementModel(db);
        const sale = await saleModel.findById(saleId);
        if (!sale)
            throw new common_1.NotFoundException('Vente non trouvée.');
        const createdReturns = [];
        for (const item of dto.items) {
            const product = await prodModel.findById(item.productId);
            if (product) {
                product.stockQuantity += item.quantity;
                await product.save();
                await movModel.create({
                    productId: product._id,
                    movementType: stock_movement_enum_1.StockMovementType.IN,
                    quantity: item.quantity,
                    referenceType: stock_movement_enum_1.StockReferenceType.ADJUSTMENT,
                    referenceId: String(sale.invoiceNumber),
                    notes: `Retour revendeur sur facture #${sale.invoiceNumber}`,
                });
            }
            const ret = await returnModel.create({
                saleId: sale._id,
                productId: new mongoose_1.Types.ObjectId(item.productId),
                quantity: item.quantity,
                reason: dto.reason || 'Retour revendeur',
                returnDate: new Date(),
            });
            createdReturns.push(ret);
        }
        sale.returnStatus = 'returned';
        sale.returnDate = new Date();
        await sale.save();
        return { message: 'Retour enregistré avec succès et stock réintégré.', returns: createdReturns };
    }
};
exports.SalesService = SalesService;
exports.SalesService = SalesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], SalesService);
//# sourceMappingURL=sales.service.js.map