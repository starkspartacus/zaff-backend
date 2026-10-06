"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const category_schema_1 = require("../common/schemas/category.schema");
const brand_schema_1 = require("../common/schemas/brand.schema");
const product_schema_1 = require("../common/schemas/product.schema");
let CatalogService = class CatalogService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getCategoryModel(db) { return this.tenantConnectionService.getModel(db, category_schema_1.Category.name, category_schema_1.CategorySchema); }
    getBrandModel(db) { return this.tenantConnectionService.getModel(db, brand_schema_1.Brand.name, brand_schema_1.BrandSchema); }
    getProductModel(db) { return this.tenantConnectionService.getModel(db, product_schema_1.Product.name, product_schema_1.ProductSchema); }
    slugify(t) {
        return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    async getCategories(db) {
        return this.getCategoryModel(db).find().sort({ name: 1 }).exec();
    }
    async createCategory(db, dto) {
        const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
        const model = this.getCategoryModel(db);
        const existing = await model.findOne({ slug });
        if (existing)
            throw new common_1.ConflictException(`La catégorie '${slug}' existe déjà.`);
        return model.create({ name: dto.name, slug, icon: dto.icon || null });
    }
    async getBrands(db) {
        return this.getBrandModel(db).find().sort({ name: 1 }).exec();
    }
    async createBrand(db, dto) {
        return this.getBrandModel(db).create(dto);
    }
    async getProducts(db, filter) {
        const model = this.getProductModel(db);
        const query = {};
        if (filter?.category && filter.category !== 'all') {
            query.category = filter.category;
        }
        if (filter?.search) {
            query.$or = [
                { name: { $regex: filter.search, $options: 'i' } },
                { sku: { $regex: filter.search, $options: 'i' } },
                { brand: { $regex: filter.search, $options: 'i' } },
            ];
        }
        return model.find(query).sort({ name: 1 }).exec();
    }
    async createProduct(db, dto) {
        const model = this.getProductModel(db);
        const sku = dto.sku.trim().toUpperCase();
        const existing = await model.findOne({ sku });
        if (existing)
            throw new common_1.ConflictException(`Le produit avec le SKU '${sku}' existe déjà.`);
        return model.create({ ...dto, sku });
    }
    async updateProduct(db, id, dto) {
        const model = this.getProductModel(db);
        const updated = await model.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!updated)
            throw new common_1.NotFoundException('Produit non trouvé.');
        return updated;
    }
    async deleteProduct(db, id) {
        const model = this.getProductModel(db);
        const res = await model.findByIdAndDelete(id).exec();
        if (!res)
            throw new common_1.NotFoundException('Produit non trouvé.');
        return { message: 'Produit supprimé avec succès.' };
    }
    async setupHierarchy(db, dto) {
        const catModel = this.getCategoryModel(db);
        const brandModel = this.getBrandModel(db);
        const slug = dto.categorySlug ? this.slugify(dto.categorySlug) : this.slugify(dto.categoryName);
        let category = await catModel.findOne({ slug });
        if (!category) {
            category = await catModel.create({ name: dto.categoryName, slug });
        }
        const createdBrands = [];
        for (const bName of dto.brands) {
            if (!bName.trim())
                continue;
            let brand = await brandModel.findOne({ name: bName.trim(), categoryId: category._id });
            if (!brand) {
                brand = await brandModel.create({ name: bName.trim(), categoryId: category._id });
            }
            createdBrands.push(brand);
        }
        return { category, brands: createdBrands };
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map