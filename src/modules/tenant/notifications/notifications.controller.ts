import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscription.dto';

@ApiTags('Tenant - Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get('push/config')
  @ApiOperation({ summary: 'Clé publique VAPID et disponibilité des notifications push' })
  pushConfig() {
    return { enabled: this.pushService.enabled, publicKey: this.pushService.publicKey };
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Recevoir les notifications sur cet appareil' })
  subscribe(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: PushSubscribeDto) {
    return this.pushService.subscribe(db, user, dto);
  }

  @Post('push/unsubscribe')
  @ApiOperation({ summary: 'Ne plus recevoir les notifications sur cet appareil' })
  unsubscribe(@CurrentTenant('databaseName') db: string, @CurrentUser() user: any, @Body() dto: PushUnsubscribeDto) {
    return this.pushService.unsubscribe(db, user, dto.endpoint);
  }

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
