import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UnitsService } from './units.service';
import { AddUnitsDto, SellUnitDto, UpdateUnitStatusDto } from './dto/units.dto';

@ApiTags('Tenant - Units (N° de série / IMEI)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les appareils (filtre produit, statut, N° de série)' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['in_stock', 'sold', 'defective', 'all'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentTenant('databaseName') db: string,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.unitsService.findAll(db, { productId, status, search, limit: limit ? Number(limit) : undefined });
  }

  @Get('lookup/:code')
  @ApiOperation({ summary: 'Résoudre un code scanné (N° de série d\'un appareil ou code-barres d\'un modèle)' })
  lookup(@CurrentTenant('databaseName') db: string, @Param('code') code: string) {
    return this.unitsService.lookup(db, code);
  }

  @Post()
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Mise en stock par scan : enregistrer des appareils par N° de série' })
  addUnits(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: AddUnitsDto) {
    return this.unitsService.addUnits(db, dto, { userId: user.userId, name: user.name });
  }

  @Post('sell')
  @Roles(Role.ADMIN, Role.SELLER)
  @ApiOperation({ summary: 'Vendre un appareil scanné (facture + mise à jour du stock)' })
  sell(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: SellUnitDto) {
    return this.unitsService.sell(db, dto, { userId: user.userId, name: user.name });
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Mettre un appareil de côté (défectueux) ou le remettre en vente' })
  updateStatus(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: UpdateUnitStatusDto) {
    return this.unitsService.updateStatus(db, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Supprimer un appareil scanné par erreur (jamais vendu)' })
  remove(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.unitsService.remove(db, id);
  }
}
