import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { SaleReturn, SaleReturnSchema } from '../common/schemas/sale-return.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { CreateSaleDto, ReturnSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getSaleReturnModel(db: string) { return this.tenantConnectionService.getModel<SaleReturn>(db, SaleReturn.name, SaleReturnSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private getWarrantyModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }

  async findAll(db: string) {
    return this.getSaleModel(db).find().populate('customerId').sort({ saleDate: -1 }).exec();
  }

  async findById(db: string, id: string) {
    const sale = await this.getSaleModel(db).findById(id).populate('customerId').exec();
    if (!sale) throw new NotFoundException('Vente non trouvée.');
    const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
    return { sale, returns };
  }

  async create(db: string, dto: CreateSaleDto) {
    const saleModel = this.getSaleModel(db);
    const prodModel = this.getProductModel(db);
    const custModel = this.getCustomerModel(db);
    const movModel = this.getStockMovementModel(db);
    const warModel = this.getWarrantyModel(db);

    // 1. Calculer le prochain numéro de facture séquentiel propre à cet établissement
    const lastSale = await saleModel.findOne().sort({ invoiceNumber: -1 }).exec();
    const nextInvoiceNumber = lastSale && lastSale.invoiceNumber ? lastSale.invoiceNumber + 1 : 1001;

    // 2. Gestion du client (existant ou créé à la volée)
    let customerId: Types.ObjectId | null = null;
    if (dto.customerId) {
      customerId = new Types.ObjectId(dto.customerId);
    } else if (dto.customerName || dto.customerPhone) {
      const newCust = await custModel.create({
        name: dto.customerName || dto.customerPhone,
        phone: dto.customerPhone || null,
        isReseller: dto.saleType === 'reseller',
      });
      customerId = newCust._id as any;
    }

    // 3. Décrémentation des stocks et préparation des mouvements
    for (const item of dto.items) {
      const product = await prodModel.findById(item.productId);
      if (!product) throw new NotFoundException(`Produit '${item.productName}' non trouvé.`);
      if (product.stockQuantity < item.quantity) {
        throw new BadRequestException(`Stock insuffisant pour '${product.name}' (Dispo: ${product.stockQuantity}).`);
      }
      product.stockQuantity -= item.quantity;
      await product.save();

      await movModel.create({
        productId: product._id,
        movementType: StockMovementType.OUT,
        quantity: item.quantity,
        referenceType: StockReferenceType.SALE,
        referenceId: String(nextInvoiceNumber),
        notes: `Vente #${nextInvoiceNumber}`,
      });
    }

    // 4. Création de la vente
    const sale = await saleModel.create({
      invoiceNumber: nextInvoiceNumber,
      customerId,
      saleDate: new Date(),
      subtotal: dto.subtotal,
      discount: dto.discount || 0,
      total: dto.total,
      paidAmount: dto.paidAmount ?? dto.total,
      paymentMethod: dto.paymentMethod,
      saleType: dto.saleType,
      items: dto.items.map((i) => ({
        ...i,
        productId: new Types.ObjectId(i.productId),
      })),
      notes: dto.notes || null,
    });

    // 5. Mise à jour des stats client
    if (customerId) {
      await custModel.findByIdAndUpdate(customerId, { $inc: { totalPurchases: dto.total } });
    }

    // 6. Création des garanties automatiques si demandées
    for (const item of dto.items) {
      if (item.warrantyEnabled && customerId) {
        const months = item.warrantyMonths || 12;
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);

        await warModel.create({
          saleId: sale._id,
          customerId,
          productId: new Types.ObjectId(item.productId),
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

  async returnItems(db: string, saleId: string, dto: ReturnSaleDto) {
    const saleModel = this.getSaleModel(db);
    const returnModel = this.getSaleReturnModel(db);
    const prodModel = this.getProductModel(db);
    const movModel = this.getStockMovementModel(db);

    const sale = await saleModel.findById(saleId);
    if (!sale) throw new NotFoundException('Vente non trouvée.');

    const createdReturns: any[] = [];
    for (const item of dto.items) {
      const product = await prodModel.findById(item.productId);
      if (product) {
        // Réincrémentation du stock
        product.stockQuantity += item.quantity;
        await product.save();

        // Tracé du mouvement de rentrée
        await movModel.create({
          productId: product._id,
          movementType: StockMovementType.IN,
          quantity: item.quantity,
          referenceType: StockReferenceType.ADJUSTMENT,
          referenceId: String(sale.invoiceNumber),
          notes: `Retour revendeur sur facture #${sale.invoiceNumber}`,
        });
      }
      const ret = await returnModel.create({
        saleId: sale._id,
        productId: new Types.ObjectId(item.productId),
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
}
