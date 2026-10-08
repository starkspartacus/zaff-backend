import { Module } from '@nestjs/common';
import { AuthModule } from '../../tenant/auth/auth.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAdminGuard } from './platform.guard';

@Module({
  imports: [AuthModule],
  controllers: [PlatformAuthController],
  // PlatformAuthService est fourni par AuthModule (la connexion des boutiques reconnaît aussi l'administrateur)
  providers: [PlatformAdminGuard],
  exports: [PlatformAdminGuard],
})
export class PlatformModule {}
