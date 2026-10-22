import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementType } from '../../../common/enums/stock-movement.enum';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { buildStockModels } from './stock-models';

@Injectable()
export class StockService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getStockMovementModel(db: string) {
    return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema);
  }
  private getProductModel(db: string) {
    return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema);
  }

  async getOverview(db: string) {
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

  /** Stock par modèle et capacité : familles → versions, vendable / dehors, rythme de vente, âge du stock */
  async byModel(db: string, opts: { days?: number; showCosts: boolean }) {
    const periodDays = Math.min(Math.max(Math.round(opts.days || 30), 7), 365);
    const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000);
    const units = this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema);
    const sales = this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema);
    const [products, open, recent] = await Promise.all([
      this.getProductModel(db).find().lean().exec(),
      units
        .find({ status: { $in: [UnitStatus.IN_STOCK, UnitStatus.CONSIGNED, UnitStatus.DEFECTIVE, UnitStatus.IN_REPAIR] } })
        .select('productId status createdAt')
        .lean()
        .exec(),
      sales.find({ saleDate: { $gte: since } }).select('items').lean().exec(),
    ]);
    const sold = new Map<string, number>();
    for (const s of recent as any[]) for (const i of s.items || []) sold.set(String(i.productId), (sold.get(String(i.productId)) || 0) + (i.quantity || 0));
    return buildStockModels({ products, units: open as any[], sold, periodDays, showCosts: opts.showCosts });
  }

  async getMovements(db: string, limit = 100) {
    const movModel = this.getStockMovementModel(db);
    return movModel.find().populate('productId').sort({ createdAt: -1 }).limit(limit).exec();
  }

  async createMovement(db: string, dto: CreateStockMovementDto, actor?: { name: string }) {
    const prodModel = this.getProductModel(db);
    const movModel = this.getStockMovementModel(db);

    const product = await prodModel.findById(dto.productId);
    if (!product) throw new NotFoundException('Produit non trouvé.');
    if (product.hasSerialNumbers) {
      throw new BadRequestException(
        `'${product.name}' est suivi par N° de série : utilisez la mise en stock par scan (ou la vente) pour modifier son stock.`,
      );
    }

    // Mise à jour atomique : une vente faite au même moment n'est jamais écrasée
    let updated: any;
    const moved = dto.quantity;
    if (dto.movementType === StockMovementType.IN) {
      if (dto.quantity < 1) throw new BadRequestException('Indiquez une quantité d\'au moins 1.');
      updated = await prodModel.findOneAndUpdate({ _id: product._id }, { $inc: { stockQuantity: dto.quantity } }, { new: true });
    } else if (dto.movementType === StockMovementType.OUT) {
      if (dto.quantity < 1) throw new BadRequestException('Indiquez une quantité d\'au moins 1.');
      updated = await prodModel.findOneAndUpdate(
        { _id: product._id, stockQuantity: { $gte: dto.quantity } },
        { $inc: { stockQuantity: -dto.quantity } },
        { new: true },
      );
      if (!updated) {
        const fresh = await prodModel.findById(product._id);
        throw new BadRequestException(`Stock insuffisant (disponible : ${fresh?.stockQuantity ?? 0}).`);
      }
    } else {
      // Ajustement : le stock compté devient le stock
      // La quantité d'un ajustement est le nouveau stock compté (affiché « = N »), l'écart va dans la note
      const before = product.stockQuantity;
      updated = await prodModel.findOneAndUpdate({ _id: product._id }, { $set: { stockQuantity: dto.quantity } }, { new: true });
      dto.notes = [`Stock compté : ${before} → ${dto.quantity}`, dto.notes].filter(Boolean).join(' — ');
    }

    const movement = await movModel.create({
      productId: new Types.ObjectId(dto.productId),
      movementType: dto.movementType,
      quantity: moved,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId || null,
      notes: [dto.notes, actor && `par ${actor.name}`].filter(Boolean).join(' — ') || null,
    });

    return { movement, currentStock: updated?.stockQuantity ?? product.stockQuantity };
  }
}
