import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InvalidateInterceptor } from './invalidate.interceptor';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EstablishmentsModule } from '../global/establishments/establishments.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { NotificationsService } from '../tenant/notifications/notifications.service';
import { NotificationsController } from '../tenant/notifications/notifications.controller';

/** Temps réel + notifications, disponibles dans tous les modules */
@Global()
@Module({
  imports: [
    EstablishmentsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('jwt.secret') }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationsController],
  providers: [RealtimeGateway, RealtimeService, NotificationsService, { provide: APP_INTERCEPTOR, useClass: InvalidateInterceptor }],
  exports: [RealtimeService, NotificationsService],
})
export class RealtimeModule {}
