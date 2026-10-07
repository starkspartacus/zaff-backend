import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto, ReturnSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Tenant - Sales & POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les ventes (un vendeur ne voit que les siennes)' })
  findAll(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any) {
    return this.salesService.findAll(db, user.role === Role.SELLER ? { sellerId: user.userId } : {});
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'une vente avec retours' })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.salesService.findById(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer une nouvelle vente (Achat ou Revendeur)' })
  create(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: CreateSaleDto) {
    return this.salesService.create(db, dto, { userId: user.userId, name: user.name });
  }

  @Post(':id/return')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enregistrer un retour et réintégrer le stock (propriétaire)' })
  returnItems(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: ReturnSaleDto) {
    return this.salesService.returnItems(db, id, dto);
  }
}
