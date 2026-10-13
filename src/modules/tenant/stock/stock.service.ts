import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementType } from '../../../common/enums/stock-movement.enum';

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
