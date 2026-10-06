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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const sale_schema_1 = require("../common/schemas/sale.schema");
const product_schema_1 = require("../common/schemas/product.schema");
const customer_schema_1 = require("../common/schemas/customer.schema");
const repair_schema_1 = require("../common/schemas/repair.schema");
const warranty_schema_1 = require("../common/schemas/warranty.schema");
let AnalyticsService = class AnalyticsService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getSaleModel(db) { return this.tenantConnectionService.getModel(db, sale_schema_1.Sale.name, sale_schema_1.SaleSchema); }
    getProductModel(db) { return this.tenantConnectionService.getModel(db, product_schema_1.Product.name, product_schema_1.ProductSchema); }
    getCustomerModel(db) { return this.tenantConnectionService.getModel(db, customer_schema_1.Customer.name, customer_schema_1.CustomerSchema); }
    getRepairModel(db) { return this.tenantConnectionService.getModel(db, repair_schema_1.Repair.name, repair_schema_1.RepairSchema); }
    getWarrantyModel(db) { return this.tenantConnectionService.getModel(db, warranty_schema_1.Warranty.name, warranty_schema_1.WarrantySchema); }
    async getDashboardStats(db) {
        const saleModel = this.getSaleModel(db);
        const prodModel = this.getProductModel(db);
        const custModel = this.getCustomerModel(db);
        const repModel = this.getRepairModel(db);
        const warModel = this.getWarrantyModel(db);
        const sales = await saleModel.find().exec();
        const products = await prodModel.find().exec();
        const customersCount = await custModel.countDocuments();
        const pendingRepairs = await repModel.countDocuments({ status: { $nin: ['completed', 'returned', 'cancelled'] } });
        const activeWarranties = await warModel.countDocuments({ status: 'active' });
        const productCostMap = new Map();
        products.forEach((p) => productCostMap.set(String(p._id), p.purchasePrice || 0));
        let totalRevenue = 0;
        let totalPurchaseCost = 0;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let todayRevenue = 0;
        let todaySalesCount = 0;
        sales.forEach((s) => {
            totalRevenue += s.total;
            s.items.forEach((item) => {
                const cost = productCostMap.get(String(item.productId)) || 0;
                totalPurchaseCost += cost * item.quantity;
            });
            if (new Date(s.saleDate) >= todayStart) {
                todayRevenue += s.total;
                todaySalesCount++;
            }
        });
        const lowStockCount = products.filter((p) => p.stockQuantity <= p.minStockAlert).length;
        return {
            totalRevenue,
            totalSales: sales.length,
            totalProducts: products.length,
            lowStockCount,
            pendingRepairs,
            activeWarranties,
            totalProfit: totalRevenue - totalPurchaseCost,
            todayRevenue,
            todaySalesCount,
            customersCount,
        };
    }
    async getDetailedAnalytics(db) {
        const saleModel = this.getSaleModel(db);
        const sales = await saleModel.find().exec();
        const productSalesMap = new Map();
        const categorySalesMap = new Map();
        sales.forEach((s) => {
            s.items.forEach((item) => {
                const currProd = productSalesMap.get(item.productName) || { quantity: 0, revenue: 0 };
                currProd.quantity += item.quantity;
                currProd.revenue += item.total;
                productSalesMap.set(item.productName, currProd);
                const cat = item.productCategory || 'autre';
                const currCat = categorySalesMap.get(cat) || { count: 0, revenue: 0 };
                currCat.count += item.quantity;
                currCat.revenue += item.total;
                categorySalesMap.set(cat, currCat);
            });
        });
        const topProducts = Array.from(productSalesMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        const categorySales = Array.from(categorySalesMap.entries()).map(([category, data]) => ({
            category,
            ...data,
        }));
        return { topProducts, categorySales };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map