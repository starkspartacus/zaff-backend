import { Injectable } from '@nestjs/common';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { Repair, RepairSchema } from '../common/schemas/repair.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';

@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private getRepairModel(db: string) { return this.tenantConnectionService.getModel<Repair>(db, Repair.name, RepairSchema); }
  private getWarrantyModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }

  async getDashboardStats(db: string) {
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

    const productCostMap = new Map<string, number>();
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

  async getDetailedAnalytics(db: string) {
    const saleModel = this.getSaleModel(db);
    const sales = await saleModel.find().exec();

    // Top produits
    const productSalesMap = new Map<string, { quantity: number; revenue: number }>();
    const categorySalesMap = new Map<string, { count: number; revenue: number }>();

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
}
