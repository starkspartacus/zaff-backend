import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto, CreateBrandDto, CreateProductDto, SetupHierarchyDto } from './dto/create-catalog.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Catalog (Products, Categories, Brands)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Lister les catégories' })
  getCategories(@CurrentTenant('databaseName') db: string) {
    return this.catalogService.getCategories(db);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Ajouter une catégorie' })
  createCategory(@CurrentTenant('databaseName') db: string, @Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(db, dto);
  }

  @Get('brands')
  @ApiOperation({ summary: 'Lister les marques' })
  getBrands(@CurrentTenant('databaseName') db: string) {
    return this.catalogService.getBrands(db);
  }

  @Post('brands')
  @ApiOperation({ summary: 'Ajouter une marque' })
  createBrand(@CurrentTenant('databaseName') db: string, @Body() dto: CreateBrandDto) {
    return this.catalogService.createBrand(db, dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'Lister les produits avec filtre' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  getProducts(
    @CurrentTenant('databaseName') db: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.catalogService.getProducts(db, { category, search });
  }

  @Post('products')
  @ApiOperation({ summary: 'Ajouter un produit' })
  createProduct(@CurrentTenant('databaseName') db: string, @Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(db, dto);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Mettre à jour un produit' })
  updateProduct(
    @CurrentTenant('databaseName') db: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateProductDto>,
  ) {
    return this.catalogService.updateProduct(db, id, dto);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Supprimer un produit' })
  deleteProduct(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.catalogService.deleteProduct(db, id);
  }

  @Post('hierarchy/setup')
  @ApiOperation({ summary: 'Assistant création hiérarchie Catégorie -> Marques' })
  setupHierarchy(@CurrentTenant('databaseName') db: string, @Body() dto: SetupHierarchyDto) {
    return this.catalogService.setupHierarchy(db, dto);
  }
}
