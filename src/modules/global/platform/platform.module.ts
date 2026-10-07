import { Module } from '@nestjs/common';
import { AuthModule } from '../../tenant/auth/auth.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAdminGuard } from './platform.guard';

@Module({
  imports: [AuthModule],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService, PlatformAdminGuard],
  exports: [PlatformAdminGuard],
})
export class PlatformModule {}
