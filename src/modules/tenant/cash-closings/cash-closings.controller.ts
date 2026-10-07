import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CashClosingsService } from './cash-closings.service';
import { CloseRegisterDto, ValidateClosingDto } from './dto/cash-closing.dto';

@ApiTags('Tenant - Cash closings (clôtures de caisse)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Controller('cash-closings')
export class CashClosingsController {
  constructor(private readonly service: CashClosingsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Ma caisse en cours : ventes non clôturées et totaux par mode de paiement' })
  current(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any) {
    return this.service.current(db, user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Clôturer ma caisse (espèces comptées)' })
  close(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: CloseRegisterDto) {
    return this.service.close(db, { userId: user.userId, name: user.name }, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Historique des clôtures (un vendeur ne voit que les siennes)' })
  @ApiQuery({ name: 'status', required: false, enum: ['submitted', 'validated', 'all'] })
  @ApiQuery({ name: 'days', required: false, description: 'Nombre de jours d\'historique (défaut 30)' })
  list(
    @CurrentTenant('databaseName') db: string,
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('days') days?: string,
  ) {
    const n = Math.min(Math.max(Number(days) || 30, 1), 366);
    const from = new Date(Date.now() - n * 24 * 3600 * 1000);
    return this.service.list(db, { sellerId: user.role === Role.SELLER ? user.userId : undefined, status, from });
  }

  @Get('open')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Caisses encore ouvertes par collaborateur (propriétaire)' })
  open(@CurrentTenant('databaseName') db: string) {
    return this.service.openRegisters(db);
  }

  @Patch(':id/validate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Confirmer la réception de l\'argent d\'une clôture (propriétaire)' })
  validate(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: ValidateClosingDto) {
    return this.service.validate(db, id, { userId: user.userId, name: user.name }, dto);
  }
}
