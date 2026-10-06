import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Supplier, SupplierSchema } from '../common/schemas/supplier.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../common/schemas/purchase-order.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { PurchaseOrderStatus } from '../../../common/enums/purchase-order-status.enum';
import { CreateSupplierDto, CreatePurchaseOrderDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getSupplierModel(db: string) { return this.tenantConnectionService.getModel<Supplier>(db, Supplier.name, SupplierSchema); }
  private getOrderModel(db: string) { return this.tenantConnectionService.getModel<PurchaseOrder>(db, PurchaseOrder.name, PurchaseOrderSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }

  // ─── Fournisseurs ────────────────────────────────────────────────────────
  async getSuppliers(db: string) {
    return this.getSupplierModel(db).find().sort({ name: 1 }).exec();
  }
  async createSupplier(db: string, dto: CreateSupplierDto) {
    return this.getSupplierModel(db).create(dto);
  }
  async updateSupplier(db: string, id: string, dto: Partial<CreateSupplierDto>) {
    const res = await this.getSupplierModel(db).findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!res) throw new NotFoundException('Fournisseur non trouvé.');
    return res;
  }

  // ─── Commandes d'approvisionnement ──────────────────────────────────────
  async getOrders(db: string) {
    return this.getOrderModel(db).find().populate('supplierId').populate('items.productId').sort({ orderDate: -1 }).exec();
  }
  async createOrder(db: string, dto: CreatePurchaseOrderDto) {
    const orderModel = this.getOrderModel(db);
    return orderModel.create({
      supplierId: new Types.ObjectId(dto.supplierId),
      status: dto.status || PurchaseOrderStatus.PENDING,
      totalAmount: dto.totalAmount,
      items: dto.items.map((i) => ({ ...i, productId: new Types.ObjectId(i.productId) })),
      notes: dto.notes || null,
    });
  }
  async receiveOrder(db: string, orderId: string) {
    const orderModel = this.getOrderModel(db);
    const prodModel = this.getProductModel(db);
    const movModel = this.getStockMovementModel(db);

    const order = await orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Commande non trouvée.');
    if (order.status === PurchaseOrderStatus.RECEIVED) return order;

    // Réception des articles -> Incrément du stock
    for (const item of order.items) {
      const product = await prodModel.findById(item.productId);
      if (product) {
        product.stockQuantity += item.quantity;
        await product.save();
        await movModel.create({
          productId: product._id,
          movementType: StockMovementType.IN,
          quantity: item.quantity,
          referenceType: StockReferenceType.PURCHASE,
          referenceId: String(order._id),
          notes: `Réception bon de commande fournisseur`,
        });
      }
    }
    order.status = PurchaseOrderStatus.RECEIVED;
    await order.save();
    return order;
  }
}
