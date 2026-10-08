import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PlatformAuthService } from '../../global/platform/platform-auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.getOrThrow<string>('jwt.expiresIn') },
      }),
      inject: [ConfigService],
    }),
    EstablishmentsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PlatformAuthService],
  exports: [AuthService, PassportModule, JwtModule, PlatformAuthService],
})
export class AuthModule {}
