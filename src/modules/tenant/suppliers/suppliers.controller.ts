import { Controller, Get, Post, Put, Body, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, CreatePurchaseOrderDto } from './dto/create-supplier.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Suppliers & Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les fournisseurs' })
  getSuppliers(@CurrentTenant('databaseName') db: string) {
    return this.suppliersService.getSuppliers(db);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter un fournisseur' })
  createSupplier(@CurrentTenant('databaseName') db: string, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.createSupplier(db, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un fournisseur' })
  updateSupplier(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: Partial<CreateSupplierDto>) {
    return this.suppliersService.updateSupplier(db, id, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Lister les commandes d\'approvisionnement' })
  getOrders(@CurrentTenant('databaseName') db: string) {
    return this.suppliersService.getOrders(db);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Créer une commande d\'achat' })
  createOrder(@CurrentTenant('databaseName') db: string, @Body() dto: CreatePurchaseOrderDto) {
    return this.suppliersService.createOrder(db, dto);
  }

  @Patch('orders/:id/receive')
  @ApiOperation({ summary: 'Valider la réception de commande (Incrémente automatiquement le stock)' })
  receiveOrder(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.suppliersService.receiveOrder(db, id);
  }
}
