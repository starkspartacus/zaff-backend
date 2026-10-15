import { Injectable, BadRequestException, ConflictException, NotFoundException, Optional } from '@nestjs/common';
import { ImagesService } from '../../global/images/images.service';
import { DeviceUsageService } from '../../global/devices/device-usage.service';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Category, CategorySchema } from '../common/schemas/category.schema';
import { Brand, BrandSchema } from '../common/schemas/brand.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { ProductUnit, ProductUnitSchema } from '../common/schemas/product-unit.schema';
import { CreateCategoryDto, CreateBrandDto, CreateProductDto, SetupHierarchyDto, UpdateProductDto } from './dto/create-catalog.dto';
import { StockMovement, StockMovementSchema } from '../common/schemas/stock-movement.schema';
import { StockMovementType, StockReferenceType } from '../../../common/enums/stock-movement.enum';
import { isValidImei } from '../../../common/imei';

export interface CatalogActor {
  /** Boutique (base globale) : une photo privée d'une autre boutique est refusée */
  establishmentId?: string;
  name?: string;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    @Optional() private readonly images?: ImagesService,
    @Optional() private readonly deviceUsage?: DeviceUsageService,
  ) {}

  /** Relie le produit au catalogue global en arrière-plan (comptage, demande d'ajout, photo officielle) */
  private track(db: string, product: any) {
    if (!this.deviceUsage || !product) return;
    const p = typeof product.toObject === 'function' ? product.toObject() : product;
    void this.deviceUsage.track(db, p);
  }

  private getCategoryModel(db: string) { return this.tenantConnectionService.getModel<Category>(db, Category.name, CategorySchema); }
  private getBrandModel(db: string) { return this.tenantConnectionService.getModel<Brand>(db, Brand.name, BrandSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }
  private getUnitModel(db: string) { return this.tenantConnectionService.getModel<ProductUnit>(db, ProductUnit.name, ProductUnitSchema); }
  private getMovementModel(db: string) { return this.tenantConnectionService.getModel<StockMovement>(db, StockMovement.name, StockMovementSchema); }

  /** Stock saisi dans la fiche (produit sans N° de série) : tracé comme un mouvement */
  private async logStock(db: string, productId: unknown, from: number, to: number, actor?: CatalogActor) {
    if (from === to) return;
    await this.getMovementModel(db).create({
      productId,
      movementType: from === 0 && to > 0 ? StockMovementType.IN : StockMovementType.ADJUSTMENT,
      // Entrée : quantité ajoutée ; ajustement : nouveau stock (affiché « = N »)
      quantity: to,
      referenceType: StockReferenceType.MANUAL,
      notes: `${from === 0 ? 'Stock initial' : `Stock corrigé ${from} → ${to}`} (fiche produit${actor?.name ? `, par ${actor.name}` : ''})`,
    });
  }

  private slugify(t: string): string {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // ─── Categories ─────────────────────────────────────────────────────────
  async getCategories(db: string) {
    return this.getCategoryModel(db).find().sort({ name: 1 }).exec();
  }
  async createCategory(db: string, dto: CreateCategoryDto) {
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    const model = this.getCategoryModel(db);
    const existing = await model.findOne({ slug });
    if (existing) throw new ConflictException(`La catégorie '${slug}' existe déjà.`);
    return model.create({ name: dto.name, slug, icon: dto.icon || null });
  }

  // ─── Brands ─────────────────────────────────────────────────────────────
  async getBrands(db: string) {
    return this.getBrandModel(db).find().sort({ name: 1 }).exec();
  }
  async createBrand(db: string, dto: CreateBrandDto) {
    return this.getBrandModel(db).create(dto);
  }

  // ─── Products ───────────────────────────────────────────────────────────
  async getProducts(db: string, filter?: { category?: string; search?: string }) {
    const model = this.getProductModel(db);
    const query: any = {};
    if (filter?.category && filter.category !== 'all') {
      query.category = filter.category;
    }
    if (filter?.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { sku: { $regex: filter.search, $options: 'i' } },
        { barcode: filter.search },
        { brand: { $regex: filter.search, $options: 'i' } },
        { model: { $regex: filter.search, $options: 'i' } },
        { color: { $regex: filter.search, $options: 'i' } },
      ];
    }
    return model.find(query).sort({ name: 1 }).exec();
  }

  private async assertBarcodeFree(db: string, barcode: string | undefined, exceptId?: string, current?: string | null) {
    if (!barcode) return;
    // Le code-barres du modèle est celui de la BOÎTE (commun à tous les appareils du modèle), jamais un IMEI / N° de série
    if (barcode.trim() !== (current || '')) {
      const code = barcode.trim();
      const unit = await this.getUnitModel(db).findOne({ serialNumber: code.replace(/\s+/g, '').toUpperCase() }).lean().exec();
      if (isValidImei(code) || unit) {
        throw new BadRequestException(
          `« ${code} » est ${unit ? 'le N° de série d\'un appareil déjà en stock' : 'un IMEI (propre à un seul téléphone)'}, pas le code-barres du modèle. ` +
            'Laissez le code-barres vide (ou scannez celui de la boîte) et scannez cet IMEI à la mise en stock.',
        );
      }
    }
    const other = await this.getProductModel(db).findOne({ barcode: barcode.trim() });
    if (other && String(other._id) !== exceptId) {
      throw new ConflictException(`Le code-barres '${barcode}' est déjà utilisé par '${other.name}'.`);
    }
  }

  async createProduct(db: string, dto: CreateProductDto, actor?: CatalogActor) {
    const model = this.getProductModel(db);
    const sku = dto.sku.trim().toUpperCase();
    const existing = await model.findOne({ sku });
    if (existing) throw new ConflictException(`Le produit avec le SKU '${sku}' existe déjà.`);
    await this.assertBarcodeFree(db, dto.barcode);
    // Produit à N° de série : le stock part de 0 et ne monte qu'en scannant des unités
    const stockQuantity = dto.hasSerialNumbers ? 0 : dto.stockQuantity || 0;
    // La photo est rattachée au produit (elle n'est plus « en attente ») ; si le produit échoue, elle est libérée
    await this.images?.attach(dto.imageId, actor?.establishmentId);
    let created;
    try {
      created = await model.create({ ...dto, sku, barcode: dto.barcode?.trim() || null, stockQuantity });
    } catch (e) {
      await this.images?.release(dto.imageId);
      throw e;
    }
    await this.logStock(db, created._id, 0, stockQuantity, actor);
    this.track(db, created);
    return created;
  }

  async updateProduct(db: string, id: string, dto: UpdateProductDto, actor?: CatalogActor) {
    const model = this.getProductModel(db);
    const product = await model.findById(id);
    if (!product) throw new NotFoundException('Produit non trouvé.');
    await this.assertBarcodeFree(db, dto.barcode, id, product.barcode);

    const update: any = { ...dto };
    const willBeSerial = dto.hasSerialNumbers ?? product.hasSerialNumbers;
    if (dto.hasSerialNumbers !== undefined && dto.hasSerialNumbers !== product.hasSerialNumbers) {
      if (dto.hasSerialNumbers && product.stockQuantity > 0) {
        throw new BadRequestException(
          'Ce produit a déjà du stock sans N° de série. Passez son stock à 0 avant d\'activer le suivi par N° de série.',
        );
      }
      if (!dto.hasSerialNumbers && (await this.getUnitModel(db).exists({ productId: product._id }))) {
        throw new BadRequestException('Des unités avec N° de série existent pour ce produit : le suivi ne peut pas être désactivé.');
      }
    }
    // Le stock d'un produit à N° de série est calculé à partir des unités
    if (willBeSerial) delete update.stockQuantity;
    else if (update.stockQuantity !== undefined) {
      const qty = Number(update.stockQuantity);
      if (!Number.isInteger(qty) || qty < 0) throw new BadRequestException('Le stock doit être un nombre entier positif.');
      update.stockQuantity = qty;
    }
    if (dto.sku) update.sku = dto.sku.trim().toUpperCase();

    // Nouvelle photo : rattachée avant l'enregistrement ; l'ancienne est libérée après (et effacée si plus utilisée)
    const previousImage = product.imageId ?? null;
    const imageChanged = dto.imageId !== undefined && String(dto.imageId ?? '') !== String(previousImage ?? '');
    if (imageChanged) await this.images?.attach(dto.imageId, actor?.establishmentId);
    let saved;
    try {
      saved = await model.findByIdAndUpdate(id, update, { new: true }).exec();
    } catch (e) {
      if (imageChanged) await this.images?.release(dto.imageId);
      throw e;
    }
    if (imageChanged) await this.images?.release(previousImage);
    if (!willBeSerial && update.stockQuantity !== undefined) await this.logStock(db, product._id, product.stockQuantity, update.stockQuantity, actor);
    this.track(db, saved);
    return saved;
  }

  async deleteProduct(db: string, id: string) {
    const model = this.getProductModel(db);
    if (await this.getUnitModel(db).exists({ productId: id })) {
      throw new BadRequestException('Ce produit a des unités enregistrées (N° de série) : il ne peut pas être supprimé.');
    }
    const res: any = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Produit non trouvé.');
    // Sa photo est libérée (effacée chez UploadThing si plus aucun produit ne l'utilise)
    await this.images?.release(res.imageId);
    return { message: 'Produit supprimé avec succès.' };
  }

  // ─── Hierarchy Wizard ───────────────────────────────────────────────────
  async setupHierarchy(db: string, dto: SetupHierarchyDto) {
    const catModel = this.getCategoryModel(db);
    const brandModel = this.getBrandModel(db);
    const slug = dto.categorySlug ? this.slugify(dto.categorySlug) : this.slugify(dto.categoryName);

    let category = await catModel.findOne({ slug });
    if (!category) {
      category = await catModel.create({ name: dto.categoryName, slug });
    }
    const createdBrands: any[] = [];
    for (const bName of dto.brands) {
      if (!bName.trim()) continue;
      let brand = await brandModel.findOne({ name: bName.trim(), categoryId: category._id });
      if (!brand) {
        brand = await brandModel.create({ name: bName.trim(), categoryId: category._id });
      }
      createdBrands.push(brand);
    }
    return { category, brands: createdBrands };
  }
}
