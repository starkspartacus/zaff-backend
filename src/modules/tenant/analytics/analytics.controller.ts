import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Tenant - Analytics & Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'KPIs Dashboard et vue synthétique financière' })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month', 'year', 'all'] })
  getDashboardStats(@CurrentTenant('databaseName') db: string, @Query('period') period?: string) {
    return this.analyticsService.getDashboardStats(db, period);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mon activité : mes ventes (vendeur) et mes mises en stock (magasinier)' })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month', 'year', 'all'] })
  getMyStats(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Query('period') period?: string) {
    return this.analyticsService.getMyStats(db, user.userId, period || 'day');
  }

  @Get('reports')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Rapports détaillés (Top produits, catégories, marges)' })
  getDetailedAnalytics(@CurrentTenant('databaseName') db: string) {
    return this.analyticsService.getDetailedAnalytics(db);
  }
}
