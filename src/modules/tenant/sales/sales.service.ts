import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { SaleReturn, SaleReturnSchema } from '../common/schemas/sale-return.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { Customer, CustomerSchema } from '../common/schemas/customer.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { Warranty, WarrantySchema } from '../common/schemas/warranty.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { CreateSaleDto, ReturnSaleDto } from './dto/create-sale.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { paymentLabel } from '../../../common/enums/payment-labels';

export interface Actor {
  userId: string;
  name: string;
}

export const normalizeSerial = (serial: string) => serial.replace(/\s+/g, '').toUpperCase();

const SOLD_FIELDS_RESET = {
  status: UnitStatus.IN_STOCK,
  saleId: null,
  invoiceNumber: null,
  soldPrice: null,
  soldBy: null,
  soldByName: null,
  soldAt: null,
};

@Injectable()
export class SalesService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  private getSaleModel(db: string) { return this.tenantConnectionService.getModel<Sale>(db, Sale.name, SaleSchema); }
  private getSaleReturnModel(db: string) { return this.tenantConnectionService.getModel<SaleReturn>(db, SaleReturn.name, SaleReturnSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private getCustomerModel(db: string) { return this.tenantConnectionService.getModel<Customer>(db, Customer.name, CustomerSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }
  private getWarrantyModel(db: string) { return this.tenantConnectionService.getModel<Warranty>(db, Warranty.name, WarrantySchema); }

  async findAll(db: string, filter: { sellerId?: string } = {}) {
    const query: any = {};
    if (filter.sellerId) query.sellerId = new Types.ObjectId(filter.sellerId);
    return this.getSaleModel(db).find(query).populate('customerId').sort({ saleDate: -1 }).exec();
  }

  async findById(db: string, id: string) {
    const sale = await this.getSaleModel(db).findById(id).populate('customerId').exec();
    if (!sale) throw new NotFoundException('Vente non trouvée.');
    const returns = await this.getSaleReturnModel(db).find({ saleId: sale._id }).populate('productId').exec();
    return { sale, returns };
  }

  async create(db: string, dto: CreateSaleDto, seller?: Actor) {
    const saleModel = this.getSaleModel(db);
    const prodModel = this.getProductModel(db);
    const unitModel = this.getUnitModel(db);
    const custModel = this.getCustomerModel(db);
    const movModel = this.getStockMovementModel(db);
    const warModel = this.getWarrantyModel(db);

    if (!dto.items?.length) throw new BadRequestException('Le panier est vide.');

    // 1. Contrôles préalables (aucune écriture)
    const products = new Map<string, any>();
    const serials = new Set<string>();
    for (const item of dto.items) {
      const product = await prodModel.findById(item.productId);
      if (!product) throw new NotFoundException(`Produit '${item.productName}' non trouvé.`);
      products.set(item.productId, product);

      if (product.hasSerialNumbers) {
        if (!item.serialNumber) {
          throw new BadRequestException(`Scannez le N° de série de '${product.name}' pour le vendre.`);
        }
        if (item.quantity !== 1) {
          throw new BadRequestException(`'${product.name}' se vend à l'unité : une ligne par N° de série.`);
        }
        item.serialNumber = normalizeSerial(item.serialNumber);
        if (serials.has(item.serialNumber)) {
          throw new BadRequestException(`Le N° de série ${item.serialNumber} est en double dans le panier.`);
        }
        serials.add(item.serialNumber);
      }
    }

    // 2. Réservation atomique des unités et du stock (annulée en cas d'échec)
    const rollback: Array<() => Promise<unknown>> = [];
    const lowStock: any[] = [];
    const undo = async () => {
      for (const fn of rollback.reverse()) await fn().catch(() => undefined);
    };
    try {
      for (const item of dto.items) {
        const product = products.get(item.productId);

        if (product.hasSerialNumbers) {
          const unit = await unitModel.findOneAndUpdate(
            { serialNumber: item.serialNumber, productId: product._id, status: UnitStatus.IN_STOCK },
            {
              status: UnitStatus.SOLD,
              soldPrice: item.unitPrice,
              soldBy: seller ? new Types.ObjectId(seller.userId) : null,
              soldByName: seller?.name || null,
              soldAt: new Date(),
            },
            { new: true },
          );
          if (!unit) throw new BadRequestException(await this.describeUnavailable(db, item.serialNumber!, product));
          rollback.push(() => unitModel.updateOne({ _id: unit._id }, SOLD_FIELDS_RESET));
        }

        const updated = await prodModel.findOneAndUpdate(
          { _id: product._id, stockQuantity: { $gte: item.quantity } },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true },
        );
        if (!updated) {
          throw new BadRequestException(`Stock insuffisant pour '${product.name}' (Dispo: ${product.stockQuantity}).`);
        }
        rollback.push(() => prodModel.updateOne({ _id: product._id }, { $inc: { stockQuantity: item.quantity } }));
        if (updated.stockQuantity <= (updated.minStockAlert ?? 0)) lowStock.push(updated);
      }
    } catch (e) {
      await undo();
      throw e;
    }

    // 3. Numéro de facture séquentiel propre à l'établissement
    const lastSale = await saleModel.findOne().sort({ invoiceNumber: -1 }).exec();
    const nextInvoiceNumber = lastSale && lastSale.invoiceNumber ? lastSale.invoiceNumber + 1 : 1001;

    // 4. Client (existant ou créé à la volée)
    let customerId: Types.ObjectId | null = null;
    if (dto.customerId) {
      customerId = new Types.ObjectId(dto.customerId);
    } else if (dto.customerName || dto.customerPhone) {
      const existing = dto.customerPhone ? await custModel.findOne({ phone: dto.customerPhone }) : null;
      const customer =
        existing ||
        (await custModel.create({
          name: dto.customerName || dto.customerPhone,
          phone: dto.customerPhone || null,
          isReseller: dto.saleType === 'reseller',
        }));
      customerId = customer._id as Types.ObjectId;
    }

    // 5. Création de la vente
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
        productSku: i.productSku || products.get(i.productId).sku,
        productCategory: i.productCategory || products.get(i.productId).category,
      })),
      notes: dto.notes || null,
      sellerId: seller ? new Types.ObjectId(seller.userId) : null,
      sellerName: seller?.name || null,
    });

    // 6. Traçabilité : unités liées à la facture, mouvements de stock, stats client
    if (serials.size) {
      await unitModel.updateMany(
        { serialNumber: { $in: [...serials] } },
        { saleId: sale._id, invoiceNumber: nextInvoiceNumber },
      );
    }
    for (const item of dto.items) {
      await movModel.create({
        productId: new Types.ObjectId(item.productId),
        movementType: StockMovementType.OUT,
        quantity: item.quantity,
        referenceType: StockReferenceType.SALE,
        referenceId: String(nextInvoiceNumber),
        notes: item.serialNumber
          ? `Vente #${nextInvoiceNumber} — N° série ${item.serialNumber}`
          : `Vente #${nextInvoiceNumber}`,
      });
    }
    if (customerId) {
      await custModel.findByIdAndUpdate(customerId, { $inc: { totalPurchases: dto.total } });
    }

    // 7. Garanties automatiques si demandées
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

    await this.publishSale(db, sale, seller, lowStock);
    return sale;
  }

  /** Temps réel : le propriétaire voit la vente, le magasinier les ruptures */
  private async publishSale(db: string, sale: any, seller: Actor | undefined, lowStock: any[]) {
    const items = sale.items.map((i: any) => (i.quantity > 1 ? `${i.quantity} × ${i.productName}` : i.productName));
    await this.notifications.notify(db, {
      type: 'sale.created',
      title: 'Nouvelle vente',
      message: `${seller?.name || 'Caisse'} a vendu ${items.join(', ')} · ${paymentLabel(sale.paymentMethod)}`,
      level: 'success',
      roles: ['admin'],
      actorId: seller?.userId,
      data: {
        saleId: String(sale._id),
        invoiceNumber: sale.invoiceNumber,
        amount: sale.total,
        sellerName: seller?.name || null,
        paymentMethod: sale.paymentMethod,
      },
    });
    for (const p of lowStock) {
      await this.notifications.notify(db, {
        type: 'stock.low',
        title: p.stockQuantity <= 0 ? 'Rupture de stock' : 'Stock bas',
        message: p.stockQuantity <= 0 ? `${p.name} est en rupture.` : `${p.name} : plus que ${p.stockQuantity} en stock.`,
        level: p.stockQuantity <= 0 ? 'error' : 'warning',
        roles: ['admin', 'storekeeper'],
        data: { productId: String(p._id), stockQuantity: p.stockQuantity },
      });
    }
    this.notifications.invalidate(db, ['sales', 'units', 'products', 'stock', 'dashboard', 'my-stats', 'customers', 'cash-closings']);
  }

  /** Message clair expliquant pourquoi une unité ne peut pas être vendue */
  private async describeUnavailable(db: string, serial: string, product: any): Promise<string> {
    const unit = await this.getUnitModel(db).findOne({ serialNumber: serial });
    if (!unit) return `Le N° de série ${serial} n'est pas enregistré en stock.`;
    if (String(unit.productId) !== String(product._id)) {
      return `Le N° de série ${serial} correspond à un autre produit que '${product.name}'.`;
    }
    if (unit.status === UnitStatus.SOLD) {
      return `L'appareil ${serial} a déjà été vendu${unit.invoiceNumber ? ` (facture #${unit.invoiceNumber})` : ''}.`;
    }
    return `L'appareil ${serial} n'est pas disponible à la vente (statut : ${unit.status}).`;
  }

  async returnItems(db: string, saleId: string, dto: ReturnSaleDto) {
    const saleModel = this.getSaleModel(db);
    const returnModel = this.getSaleReturnModel(db);
    const prodModel = this.getProductModel(db);
    const unitModel = this.getUnitModel(db);
    const movModel = this.getStockMovementModel(db);

    const sale = await saleModel.findById(saleId);
    if (!sale) throw new NotFoundException('Vente non trouvée.');

    const createdReturns: any[] = [];
    for (const item of dto.items) {
      const product = await prodModel.findById(item.productId);
      if (product) {
        // Appareil à N° de série : il redevient disponible
        if (item.serialNumber) {
          const serial = normalizeSerial(item.serialNumber);
          const res = await unitModel.updateOne(
            { serialNumber: serial, saleId: sale._id, status: UnitStatus.SOLD },
            SOLD_FIELDS_RESET,
          );
          if (!res.modifiedCount) {
            throw new BadRequestException(`Le N° de série ${serial} ne fait pas partie de cette vente.`);
          }
        }

        await prodModel.updateOne({ _id: product._id }, { $inc: { stockQuantity: item.quantity } });

        await movModel.create({
          productId: product._id,
          movementType: StockMovementType.IN,
          quantity: item.quantity,
          referenceType: StockReferenceType.ADJUSTMENT,
          referenceId: String(sale.invoiceNumber),
          notes: `Retour sur facture #${sale.invoiceNumber}${item.serialNumber ? ` — N° série ${normalizeSerial(item.serialNumber)}` : ''}`,
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

    this.notifications.invalidate(db, ['sales', 'units', 'products', 'stock', 'dashboard', 'my-stats']);
    return { message: 'Retour enregistré avec succès et stock réintégré.', returns: createdReturns };
  }
}
