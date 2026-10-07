import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Tenant - Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications (50 dernières, selon mon rôle)' })
  list(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any) {
    return this.notificationsService.list(db, user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  markAllRead(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any) {
    return this.notificationsService.markAllRead(db, user);
  }
}
