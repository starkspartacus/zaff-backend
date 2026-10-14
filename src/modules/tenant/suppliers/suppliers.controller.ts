import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import {
  CreatePurchaseOrderDto, CreateSupplierDto, ReceivePurchaseOrderDto, SupplierPaymentDto, UpdateSupplierDto,
} from './dto/create-supplier.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

const actorOf = (user: any) => ({ userId: user.userId, name: user.name, role: user.role });

@ApiTags('Tenant - Fournisseurs & commandes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STOREKEEPER)
@Invalidates('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Fournisseurs (avec reste à payer et commandes en cours)' })
  getSuppliers(@CurrentTenant('databaseName') db: string) {
    return this.suppliersService.getSuppliers(db);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter un fournisseur' })
  createSupplier(@CurrentTenant() tenant: any, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.createSupplier(tenant.databaseName, dto, tenant.countryCode);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un fournisseur' })
  updateSupplier(@CurrentTenant() tenant: any, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.updateSupplier(tenant.databaseName, id, dto, tenant.countryCode);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Supprimer un fournisseur sans commande' })
  deleteSupplier(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.suppliersService.deleteSupplier(db, id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Commandes (status=open|closed|unpaid, supplierId)' })
  getOrders(@CurrentTenant('databaseName') db: string, @Query('status') status?: string, @Query('supplierId') supplierId?: string) {
    return this.suppliersService.getOrders(db, { status, supplierId });
  }

  @Get('orders/summary')
  @ApiOperation({ summary: 'Commandes en cours, en retard, reste à payer aux fournisseurs' })
  summary(@CurrentTenant('databaseName') db: string) {
    return this.suppliersService.summary(db);
  }

  @Get('orders/suggestions')
  @ApiOperation({ summary: 'Articles à recommander (stock sous le seuil d\'alerte)' })
  suggestions(@CurrentTenant('databaseName') db: string) {
    return this.suppliersService.suggestions(db);
  }

  @Get('orders/:id')
  getOrder(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.suppliersService.getOrder(db, id);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Créer un bon de commande (prix et totaux fixés par le serveur)' })
  createOrder(@CurrentTenant('databaseName') db: string, @Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: any) {
    return this.suppliersService.createOrder(db, dto, actorOf(user));
  }

  @Post('orders/:id/receive')
  @ApiOperation({ summary: 'Réceptionner tout ou partie (quantités, ou N° de série scannés)' })
  receive(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto, @CurrentUser() user: any) {
    return this.suppliersService.receive(db, id, dto, actorOf(user));
  }

  @Patch('orders/:id/close')
  @ApiOperation({ summary: 'Solder : abandonner le reliquat non livré' })
  close(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.suppliersService.close(db, id);
  }

  @Patch('orders/:id/cancel')
  @ApiOperation({ summary: 'Annuler une commande non reçue et non payée' })
  cancel(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.suppliersService.cancel(db, id);
  }

  @Post('orders/:id/payments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Payer le fournisseur (jamais plus que le reste à payer)' })
  pay(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: SupplierPaymentDto, @CurrentUser() user: any) {
    return this.suppliersService.pay(db, id, dto, actorOf(user));
  }
}
