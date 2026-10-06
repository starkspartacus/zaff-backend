import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto, ReturnSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Sales & POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les ventes' })
  findAll(@CurrentTenant('databaseName') db: string) {
    return this.salesService.findAll(db);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'une vente avec retours' })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.salesService.findById(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer une nouvelle vente (Achat ou Revendeur)' })
  create(@CurrentTenant('databaseName') db: string, @Body() dto: CreateSaleDto) {
    return this.salesService.create(db, dto);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Enregistrer un retour revendeur et réintégrer le stock' })
  returnItems(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: ReturnSaleDto) {
    return this.salesService.returnItems(db, id, dto);
  }
}
