import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'zaff_jwt_secret_token_secure_key_2026',
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      tenantDb: payload.tenantDb,
      role: payload.role,
      phone: payload.phone,
      email: payload.email,
      name: payload.name,
    };
  }
}
