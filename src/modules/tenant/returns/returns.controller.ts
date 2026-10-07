import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { resolveReturnPolicy } from '../settings/return-policy';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/returns.dto';

@ApiTags('Tenant - Returns (retours, avoirs, garantie)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Controller()
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get('returns/lookup/:serial')
  @ApiOperation({ summary: 'Appareil scanné : vente, garantie et solutions de retour autorisées par la boutique' })
  lookup(@CurrentTenant() tenant: any, @Param('serial') serial: string) {
    return this.service.lookup(tenant.databaseName, resolveReturnPolicy(tenant.settings), serial);
  }

  @Post('returns')
  @ApiOperation({ summary: 'Enregistrer un retour (avoir, remboursement, échange, réparation)' })
  create(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Body() dto: CreateReturnDto) {
    return this.service.create(tenant.databaseName, resolveReturnPolicy(tenant.settings), { userId: user.userId, name: user.name }, dto);
  }

  @Get('returns')
  @ApiOperation({ summary: 'Historique des retours (un vendeur ne voit que les siens)' })
  @ApiQuery({ name: 'days', required: false })
  list(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Query('days') days?: string) {
    return this.service.list(db, { processedBy: user.role === Role.SELLER ? user.userId : undefined, days: Number(days) || 30 });
  }

  @Get('credit-notes/:code')
  @ApiOperation({ summary: 'Vérifier un avoir (solde, validité)' })
  findCreditNote(@CurrentTenant('databaseName') db: string, @Param('code') code: string) {
    return this.service.findCreditNote(db, code);
  }

  @Get('credit-notes')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Avoirs émis (propriétaire)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'used', 'all'] })
  listCreditNotes(@CurrentTenant('databaseName') db: string, @Query('status') status?: string) {
    return this.service.listCreditNotes(db, status);
  }
}
