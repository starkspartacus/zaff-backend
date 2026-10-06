import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Aperçu du stock et alertes' })
  getOverview(@CurrentTenant('databaseName') db: string) {
    return this.stockService.getOverview(db);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Historique des mouvements de stock' })
  @ApiQuery({ name: 'limit', required: false })
  getMovements(@CurrentTenant('databaseName') db: string, @Query('limit') limit?: number) {
    return this.stockService.getMovements(db, limit ? Number(limit) : 100);
  }

  @Post('movements')
  @ApiOperation({ summary: 'Enregistrer une entrée/sortie/ajustement de stock' })
  createMovement(@CurrentTenant('databaseName') db: string, @Body() dto: CreateStockMovementDto) {
    return this.stockService.createMovement(db, dto);
  }
}
