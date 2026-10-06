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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const catalog_service_1 = require("./catalog.service");
const create_catalog_dto_1 = require("./dto/create-catalog.dto");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const current_tenant_decorator_1 = require("../../../common/decorators/current-tenant.decorator");
let CatalogController = class CatalogController {
    constructor(catalogService) {
        this.catalogService = catalogService;
    }
    getCategories(db) {
        return this.catalogService.getCategories(db);
    }
    createCategory(db, dto) {
        return this.catalogService.createCategory(db, dto);
    }
    getBrands(db) {
        return this.catalogService.getBrands(db);
    }
    createBrand(db, dto) {
        return this.catalogService.createBrand(db, dto);
    }
    getProducts(db, category, search) {
        return this.catalogService.getProducts(db, { category, search });
    }
    createProduct(db, dto) {
        return this.catalogService.createProduct(db, dto);
    }
    updateProduct(db, id, dto) {
        return this.catalogService.updateProduct(db, id, dto);
    }
    deleteProduct(db, id) {
        return this.catalogService.deleteProduct(db, id);
    }
    setupHierarchy(db, dto) {
        return this.catalogService.setupHierarchy(db, dto);
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, common_1.Get)('categories'),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les catégories' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "getCategories", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, swagger_1.ApiOperation)({ summary: 'Ajouter une catégorie' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_catalog_dto_1.CreateCategoryDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Get)('brands'),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les marques' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "getBrands", null);
__decorate([
    (0, common_1.Post)('brands'),
    (0, swagger_1.ApiOperation)({ summary: 'Ajouter une marque' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_catalog_dto_1.CreateBrandDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "createBrand", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les produits avec filtre' }),
    (0, swagger_1.ApiQuery)({ name: 'category', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "getProducts", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, swagger_1.ApiOperation)({ summary: 'Ajouter un produit' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_catalog_dto_1.CreateProductDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Put)('products/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Mettre à jour un produit' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "updateProduct", null);
__decorate([
    (0, common_1.Delete)('products/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Supprimer un produit' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "deleteProduct", null);
__decorate([
    (0, common_1.Post)('hierarchy/setup'),
    (0, swagger_1.ApiOperation)({ summary: 'Assistant création hiérarchie Catégorie -> Marques' }),
    __param(0, (0, current_tenant_decorator_1.CurrentTenant)('databaseName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_catalog_dto_1.SetupHierarchyDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "setupHierarchy", null);
exports.CatalogController = CatalogController = __decorate([
    (0, swagger_1.ApiTags)('Tenant - Catalog (Products, Categories, Brands)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    (0, common_1.Controller)('catalog'),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService])
], CatalogController);
//# sourceMappingURL=catalog.controller.js.map