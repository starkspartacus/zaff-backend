import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { Repair, RepairSchema } from '../common/schemas/repair.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { ProductReturn, ProductReturnSchema } from '../returns/schemas/product-return.schema';

@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private getRepairModel(db: string) { return this.tenantConnectionService.getModel<Repair>(db, Repair.name, RepairSchema); }
  private getWarrantyModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }
  private getReturnModel(db: string) { return this.tenantConnectionService.getModel<ProductReturn>(db, ProductReturn.name, ProductReturnSchema); }
  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }

  private periodStart(period: string): Date | null {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      case 'all':
        return null;
      case 'month':
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  async getDashboardStats(db: string, period = 'month') {
    const saleModel = this.getSaleModel(db);
    const prodModel = this.getProductModel(db);
    const from = this.periodStart(period);
    const match = from ? { saleDate: { $gte: from } } : {};

    const [salesAgg, topProducts, products, customersCount, pendingRepairs, completedRepairs, activeWarranties, bySeller, returnsAgg] =
      await Promise.all([
        saleModel.aggregate([
          { $match: match },
          { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
        ]),
        saleModel.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              productName: { $first: '$items.productName' },
              quantitySold: { $sum: '$items.quantity' },
              totalRevenue: { $sum: '$items.total' },
            },
          },
          { $sort: { totalRevenue: -1 } },
        ]),
        prodModel.find({}, { purchasePrice: 1, stockQuantity: 1, minStockAlert: 1 }).lean().exec(),
        this.getCustomerModel(db).countDocuments(),
        this.getRepairModel(db).countDocuments({ status: { $nin: ['completed', 'returned', 'cancelled'] } }),
        this.getRepairModel(db).countDocuments({ status: 'completed' }),
        this.getWarrantyModel(db).countDocuments({ status: 'active' }),
        saleModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: '$sellerId',
              sellerName: { $first: '$sellerName' },
              count: { $sum: 1 },
              revenue: { $sum: '$total' },
              lastSaleAt: { $max: '$saleDate' },
            },
          },
          { $sort: { revenue: -1 } },
        ]),
        // Retours de la période : avoirs, échanges et remboursements viennent en déduction du CA
        this.getReturnModel(db).aggregate([
          { $match: from ? { createdAt: { $gte: from } } : {} },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
      ]);

    // Marge = CA - coût d'achat (prix d'achat actuel du produit)
    const costMap = new Map<string, number>();
    products.forEach((p: any) => costMap.set(String(p._id), p.purchasePrice || 0));
    const purchaseCost = topProducts.reduce(
      (sum, p) => sum + (costMap.get(String(p._id)) || 0) * p.quantitySold,
      0,
    );
    const revenue = salesAgg[0]?.revenue || 0;
    const returnsAmount = returnsAgg[0]?.amount || 0;

    return {
      period,
      from,
      sales: {
        count: salesAgg[0]?.count || 0,
        revenue,
        profit: revenue - purchaseCost - returnsAmount,
        returns: { count: returnsAgg[0]?.count || 0, amount: returnsAmount },
        netRevenue: revenue - returnsAmount,
      },
      inventory: {
        totalProducts: products.length,
        totalUnits: products.reduce((sum, p: any) => sum + (p.stockQuantity || 0), 0),
        totalStockValue: products.reduce((sum, p: any) => sum + (p.purchasePrice || 0) * (p.stockQuantity || 0), 0),
        lowStockCount: products.filter((p: any) => p.stockQuantity <= p.minStockAlert).length,
      },
      repairs: { pending: pendingRepairs, completed: completedRepairs },
      warranties: { active: activeWarranties },
      customers: { count: customersCount },
      bySeller: bySeller.map((b) => ({
        sellerId: b._id,
        sellerName: b.sellerName || 'Non attribué',
        count: b.count,
        revenue: b.revenue,
        lastSaleAt: b.lastSaleAt,
      })),
      topProducts: topProducts.slice(0, 5).map((p) => ({
        productId: p._id,
        productName: p.productName,
        quantitySold: p.quantitySold,
        totalRevenue: p.totalRevenue,
      })),
    };
  }

  /** Tableau de bord personnel : ventes du vendeur et mises en stock du magasinier */
  async getMyStats(db: string, userId: string, period = 'day') {
    const from = this.periodStart(period);
    const me = new Types.ObjectId(userId);
    const saleMatch: any = { sellerId: me };
    const unitMatch: any = { addedBy: me };
    if (from) {
      saleMatch.saleDate = { $gte: from };
      unitMatch.createdAt = { $gte: from };
    }

    const [salesAgg, recentSales, unitsAdded, recentUnits] = await Promise.all([
      this.getSaleModel(db).aggregate([
        { $match: saleMatch },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' }, items: { $sum: { $size: '$items' } } } },
      ]),
      this.getSaleModel(db).find(saleMatch).populate('customerId').sort({ saleDate: -1 }).limit(20).exec(),
      this.getUnitModel(db).countDocuments(unitMatch),
      this.getUnitModel(db).find(unitMatch).populate('productId').sort({ createdAt: -1 }).limit(20).exec(),
    ]);

    return {
      period,
      from,
      sales: {
        count: salesAgg[0]?.count || 0,
        revenue: salesAgg[0]?.revenue || 0,
        items: salesAgg[0]?.items || 0,
        recent: recentSales,
      },
      stocking: { unitsAdded, recent: recentUnits },
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
