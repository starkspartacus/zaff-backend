import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { UnitStatus } from '../../../common/enums/unit-status.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { SaleType } from '../../../common/enums/sale-type.enum';
import { Actor, SalesService, normalizeSerial } from '../sales/sales.service';
import { AddUnitsDto, SellUnitDto, UpdateUnitStatusDto } from './dto/units.dto';
import { NotificationsService } from '../notifications/notifications.service';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class UnitsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly salesService: SalesService,
    private readonly notifications: NotificationsService,
  ) {}

  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getStockMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }

  async findAll(db: string, filter: { productId?: string; status?: string; search?: string; limit?: number }) {
    const query: any = {};
    if (filter.productId) query.productId = new Types.ObjectId(filter.productId);
    if (filter.status && filter.status !== 'all') query.status = filter.status;
    if (filter.search) query.serialNumber = { $regex: escapeRegex(normalizeSerial(filter.search)) };
    return this.getUnitModel(db)
      .find(query)
      .populate('productId')
      .sort({ createdAt: -1 })
      .limit(Math.min(filter.limit || 200, 1000))
      .exec();
  }

  /**
   * Résolution d'un code scanné :
   * - N° de série / IMEI d'une unité → l'appareil précis
   * - code-barres EAN d'un modèle → le modèle (et ses unités disponibles)
   */
  async lookup(db: string, rawCode: string) {
    const code = rawCode.trim();
    const unit = await this.getUnitModel(db).findOne({ serialNumber: normalizeSerial(code) }).populate('productId').exec();
    if (unit) {
      return { type: 'unit' as const, unit, product: unit.productId, sellable: unit.status === UnitStatus.IN_STOCK };
    }
    const product = await this.getProductModel(db).findOne({ barcode: code }).exec();
    if (product) {
      const availableUnits = product.hasSerialNumbers
        ? await this.getUnitModel(db).countDocuments({ productId: product._id, status: UnitStatus.IN_STOCK })
        : product.stockQuantity;
      return { type: 'product' as const, product, availableUnits };
    }
    throw new NotFoundException(`Aucun appareil ni produit ne correspond au code « ${code} ».`);
  }

  /** Mise en stock par scan (magasinier) : chaque N° de série devient une unité */
  async addUnits(db: string, dto: AddUnitsDto, actor: Actor) {
    const unitModel = this.getUnitModel(db);
    const product = await this.getProductModel(db).findById(dto.productId);
    if (!product) throw new NotFoundException('Produit non trouvé.');
    if (!product.hasSerialNumbers) {
      throw new BadRequestException(
        `'${product.name}' n'est pas suivi par N° de série. Activez l'option dans le catalogue ou utilisez un mouvement de stock.`,
      );
    }

    const created: ProductUnit[] = [];
    const rejected: Array<{ serialNumber: string; reason: string }> = [];
    const seen = new Set<string>();

    for (const raw of dto.serialNumbers) {
      const serialNumber = normalizeSerial(raw || '');
      if (!serialNumber) continue;
      if (seen.has(serialNumber)) {
        rejected.push({ serialNumber, reason: 'Scanné deux fois dans ce lot.' });
        continue;
      }
      seen.add(serialNumber);
      if (serialNumber.length < 4) {
        rejected.push({ serialNumber, reason: 'N° de série trop court.' });
        continue;
      }

      const existing = await unitModel.findOne({ serialNumber }).populate('productId');
      if (existing) {
        const owner: any = existing.productId;
        rejected.push({
          serialNumber,
          reason:
            existing.status === UnitStatus.SOLD
              ? `Déjà enregistré et vendu${existing.invoiceNumber ? ` (facture #${existing.invoiceNumber})` : ''}.`
              : `Déjà en stock${owner?.name ? ` (${owner.name})` : ''}.`,
        });
        continue;
      }

      try {
        created.push(
          await unitModel.create({
            productId: product._id,
            serialNumber,
            status: UnitStatus.IN_STOCK,
            addedBy: new Types.ObjectId(actor.userId),
            addedByName: actor.name,
            notes: dto.notes || null,
          }),
        );
      } catch (e: any) {
        // Doublon inséré au même moment par un autre poste (index unique)
        if (e?.code === 11000) rejected.push({ serialNumber, reason: 'Déjà en stock.' });
        else throw e;
      }
    }

    let stockQuantity = product.stockQuantity;
    if (created.length) {
      const updated = await this.getProductModel(db).findByIdAndUpdate(
        product._id,
        { $inc: { stockQuantity: created.length } },
        { new: true },
      );
      stockQuantity = updated?.stockQuantity ?? stockQuantity + created.length;
      const serials = created.map((u) => u.serialNumber);
      await this.getStockMovementModel(db).create({
        productId: product._id,
        movementType: StockMovementType.IN,
        quantity: created.length,
        referenceType: StockReferenceType.MANUAL,
        notes: `Mise en stock par ${actor.name} : ${serials.slice(0, 10).join(', ')}${serials.length > 10 ? `… (+${serials.length - 10})` : ''}`,
      });
      await this.notifications.notify(db, {
        type: 'units.added',
        title: 'Mise en stock',
        message: `${actor.name} a mis en stock ${created.length} × ${product.name}`,
        level: 'info',
        roles: ['admin'],
        actorId: actor.userId,
        data: { productId: String(product._id), count: created.length, stockQuantity },
      });
      this.notifications.invalidate(db, ['units', 'products', 'stock', 'dashboard', 'my-stats']);
    }

    return { product, created, rejected, stockQuantity };
  }

  /** Vente d'un appareil scanné (vendeur) : crée la facture et met le stock à jour */
  async sell(db: string, dto: SellUnitDto, actor: Actor) {
    const serialNumber = normalizeSerial(dto.serialNumber);
    const unit = await this.getUnitModel(db).findOne({ serialNumber });
    if (!unit) throw new NotFoundException(`Le N° de série ${serialNumber} n'est pas enregistré en stock.`);
    const product = await this.getProductModel(db).findById(unit.productId);
    if (!product) throw new NotFoundException('Le produit de cet appareil n\'existe plus.');

    const unitPrice = dto.unitPrice ?? product.salePrice;
    const warrantyMonths = dto.warrantyMonths ?? 0;

    const sale = await this.salesService.create(
      db,
      {
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        items: [
          {
            productId: String(product._id),
            productName: product.name,
            productSku: product.sku,
            productCategory: product.category,
            quantity: 1,
            unitPrice,
            total: unitPrice,
            serialNumber,
            warrantyEnabled: warrantyMonths > 0,
            warrantyMonths,
          },
        ],
        subtotal: unitPrice,
        discount: 0,
        total: unitPrice,
        paidAmount: dto.paidAmount ?? unitPrice,
        paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
        saleType: SaleType.PURCHASE,
      },
      actor,
    );

    const soldUnit = await this.getUnitModel(db).findById(unit._id).populate('productId');
    return { sale, unit: soldUnit };
  }

  /** Mettre de côté un appareil défectueux, ou le remettre en vente */
  async updateStatus(db: string, id: string, dto: UpdateUnitStatusDto) {
    const unitModel = this.getUnitModel(db);
    const unit = await unitModel.findById(id);
    if (!unit) throw new NotFoundException('Appareil non trouvé.');
    if (unit.status === UnitStatus.SOLD) throw new BadRequestException('Un appareil vendu ne peut pas changer de statut (passez par un retour).');
    if (unit.status === dto.status) return unit;

    const from = unit.status;
    const updated = await unitModel.findOneAndUpdate(
      { _id: unit._id, status: from },
      { status: dto.status, notes: dto.notes ?? unit.notes },
      { new: true },
    );
    if (!updated) throw new BadRequestException('Cet appareil vient d\'être modifié, réessayez.');

    const delta = dto.status === UnitStatus.IN_STOCK ? 1 : -1;
    await this.getProductModel(db).updateOne({ _id: unit.productId }, { $inc: { stockQuantity: delta } });
    await this.getStockMovementModel(db).create({
      productId: unit.productId,
      movementType: delta > 0 ? StockMovementType.IN : StockMovementType.OUT,
      quantity: 1,
      referenceType: StockReferenceType.ADJUSTMENT,
      notes: `${unit.serialNumber} ${delta > 0 ? 'remis en vente' : 'mis de côté (défectueux)'}${dto.notes ? ` : ${dto.notes}` : ''}`,
    });
    this.notifications.invalidate(db, ['units', 'products', 'stock', 'dashboard']);
    return updated.populate('productId');
  }

  /** Supprimer une unité scannée par erreur (jamais vendue) */
  async remove(db: string, id: string) {
    const unitModel = this.getUnitModel(db);
    const unit = await unitModel.findOneAndDelete({ _id: id, status: { $ne: UnitStatus.SOLD } });
    if (!unit) throw new BadRequestException('Appareil introuvable ou déjà vendu : il ne peut pas être supprimé.');
    if (unit.status === UnitStatus.IN_STOCK) {
      await this.getProductModel(db).updateOne({ _id: unit.productId }, { $inc: { stockQuantity: -1 } });
    }
    await this.getStockMovementModel(db).create({
      productId: unit.productId,
      movementType: StockMovementType.OUT,
      quantity: unit.status === UnitStatus.IN_STOCK ? 1 : 0,
      referenceType: StockReferenceType.ADJUSTMENT,
      notes: `Unité ${unit.serialNumber} supprimée (erreur de saisie)`,
    });
    this.notifications.invalidate(db, ['units', 'products', 'stock', 'dashboard', 'my-stats']);
    return { message: `Appareil ${unit.serialNumber} supprimé du stock.` };
  }
}
