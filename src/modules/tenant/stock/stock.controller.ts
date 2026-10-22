import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Tenant - Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Invalidates('products', 'stock', 'dashboard')
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Aperçu du stock et alertes' })
  getOverview(@CurrentTenant('databaseName') db: string) {
    return this.stockService.getOverview(db);
  }

  @Get('models')
  @ApiOperation({ summary: 'Stock par modèle et capacité (familles → versions, rythme de vente, âge du stock)' })
  @ApiQuery({ name: 'days', required: false, description: 'Période de vente observée (7 à 365 jours, 30 par défaut)' })
  byModel(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Query('days') days?: string) {
    // Les vendeurs voient le stock, jamais les prix d'achat ni la valeur du stock
    return this.stockService.byModel(db, { days: days ? Number(days) : 30, showCosts: user?.role !== Role.SELLER && user?.role !== 'standard' });
  }

  @Get('movements')
  @ApiOperation({ summary: 'Historique des mouvements de stock' })
  @ApiQuery({ name: 'limit', required: false })
  getMovements(@CurrentTenant('databaseName') db: string, @Query('limit') limit?: number) {
    return this.stockService.getMovements(db, limit ? Number(limit) : 100);
  }

  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @Post('movements')
  @ApiOperation({ summary: 'Enregistrer une entrée/sortie/ajustement de stock' })
  createMovement(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: CreateStockMovementDto) {
    return this.stockService.createMovement(db, dto, { name: user.name });
  }
}
