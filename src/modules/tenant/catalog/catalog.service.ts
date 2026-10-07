import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Category, CategorySchema } from '../common/schemas/category.schema';
import { Brand, BrandSchema } from '../common/schemas/brand.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { CreateCategoryDto, CreateBrandDto, CreateProductDto, SetupHierarchyDto } from './dto/create-catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getCategoryModel(db: string) { return this.tenantConnectionService.getModel<Category>(db, Category.name, CategorySchema); }
  private getBrandModel(db: string) { return this.tenantConnectionService.getModel<Brand>(db, Brand.name, BrandSchema); }
  private getProductModel(db: string) { return this.tenantConnectionService.getModel<Product>(db, Product.name, ProductSchema); }

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
      ];
    }
    return model.find(query).sort({ name: 1 }).exec();
  }

  async createProduct(db: string, dto: CreateProductDto) {
    const model = this.getProductModel(db);
    const sku = dto.sku.trim().toUpperCase();
    const existing = await model.findOne({ sku });
    if (existing) throw new ConflictException(`Le produit avec le SKU '${sku}' existe déjà.`);
    return model.create({ ...dto, sku });
  }

  async updateProduct(db: string, id: string, dto: Partial<CreateProductDto>) {
    const model = this.getProductModel(db);
    const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!updated) throw new NotFoundException('Produit non trouvé.');
    return updated;
  }

  async deleteProduct(db: string, id: string) {
    const model = this.getProductModel(db);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Produit non trouvé.');
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
