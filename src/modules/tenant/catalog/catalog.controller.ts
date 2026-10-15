import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCategoryDto, CreateBrandDto, CreateProductDto, UpdateProductDto, CreateVariantDto, CreateVariantsDto, SetupHierarchyDto } from './dto/create-catalog.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Tenant - Catalog (Products, Categories, Brands)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Invalidates('products', 'stock', 'dashboard')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'Lister les catégories' })
  getCategories(@CurrentTenant('databaseName') db: string) {
    return this.catalogService.getCategories(db);
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
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

  @Roles(Role.ADMIN, Role.STOREKEEPER)
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

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Post('products')
  @ApiOperation({ summary: 'Ajouter un produit' })
  createProduct(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(tenant.databaseName, dto, { establishmentId: String(tenant._id), name: user?.name });
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Post('products/:id/variant')
  @ApiOperation({ summary: 'Créer (ou retrouver) une variante du modèle : autre capacité / couleur, stock séparé' })
  createVariant(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.catalogService.createVariant(tenant.databaseName, id, dto, { establishmentId: String(tenant._id), name: user?.name });
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Post('products/:id/variants')
  @ApiOperation({ summary: 'Ajout multiple : plusieurs versions (capacité / couleur / prix) du modèle en une fois' })
  async createVariants(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateVariantsDto) {
    const results = await this.catalogService.createVariants(tenant.databaseName, id, dto.variants, { establishmentId: String(tenant._id), name: user?.name });
    const created = results.filter((r) => r.created);
    if (created.length && user?.role !== 'admin') {
      await this.notifications.notify(tenant.databaseName, {
        type: 'catalog.versions',
        title: 'Nouvelles versions au catalogue',
        message: `${user?.name || 'Un collaborateur'} a ajouté ${created.length} version(s) de ${created[0].product.name} : ${created.map((r) => [r.product.model, r.product.color].filter(Boolean).join(' ')).join(', ')}`,
        level: 'info',
        roles: ['admin'],
        actorId: user?.userId,
        data: { productIds: created.map((r) => String(r.product._id)) },
      });
    }
    return results;
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Put('products/:id')
  @ApiOperation({ summary: 'Mettre à jour un produit' })
  updateProduct(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(tenant.databaseName, id, dto, { establishmentId: String(tenant._id), name: user?.name });
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Delete('products/:id')
  @ApiOperation({ summary: 'Supprimer un produit' })
  deleteProduct(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.catalogService.deleteProduct(db, id);
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Post('hierarchy/setup')
  @ApiOperation({ summary: 'Assistant création hiérarchie Catégorie -> Marques' })
  setupHierarchy(@CurrentTenant('databaseName') db: string, @Body() dto: SetupHierarchyDto) {
    return this.catalogService.setupHierarchy(db, dto);
  }
}
