import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CurrentTenant } from '../../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ReceptionsService } from './receptions.service';
import { CreateReceptionDto } from './receptions.dto';

@ApiTags('Tenant - Réceptions de marchandise (ravitaillements)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STOREKEEPER)
@Controller('stock-receptions')
export class ReceptionsController {
  constructor(private readonly service: ReceptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Historique des réceptions (from, to, category)' })
  list(@CurrentTenant('databaseName') db: string, @Query('from') from?: string, @Query('to') to?: string, @Query('category') category?: string) {
    return this.service.list(db, { from, to, category });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail : catégorie → modèle → N° de série' })
  get(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.get(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Mise en stock en rafale : tous les appareils scannés, en une réception REC-n' })
  create(@CurrentTenant('databaseName') db: string, @Body() dto: CreateReceptionDto, @CurrentUser() user: any) {
    return this.service.receiveScanned(db, dto.items, { note: dto.note, supplierName: dto.supplierName }, { userId: user.userId, name: user.name, role: user.role });
  }
}
