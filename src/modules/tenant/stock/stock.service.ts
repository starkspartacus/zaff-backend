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

  async createMovement(db: string, dto: CreateStockMovementDto) {
    const prodModel = this.getProductModel(db);
    const movModel = this.getStockMovementModel(db);

    const product = await prodModel.findById(dto.productId);
    if (!product) throw new NotFoundException('Produit non trouvé.');

    let stockChange = 0;
    if (dto.movementType === StockMovementType.IN) {
      stockChange = dto.quantity;
    } else if (dto.movementType === StockMovementType.OUT) {
      if (product.stockQuantity < dto.quantity) {
        throw new BadRequestException(`Stock insuffisant (Disponible: ${product.stockQuantity}).`);
      }
      stockChange = -dto.quantity;
    } else if (dto.movementType === StockMovementType.ADJUSTMENT) {
      stockChange = dto.quantity - product.stockQuantity;
    }

    product.stockQuantity += stockChange;
    await product.save();

    const movement = await movModel.create({
      productId: new Types.ObjectId(dto.productId),
      movementType: dto.movementType,
      quantity: Math.abs(dto.quantity),
      referenceType: dto.referenceType,
      referenceId: dto.referenceId || null,
      notes: dto.notes || null,
    });

    return { movement, currentStock: product.stockQuantity };
  }
}
