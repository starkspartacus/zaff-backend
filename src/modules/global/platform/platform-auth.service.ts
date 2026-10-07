import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import { Role } from '../../../common/enums/role.enum';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

/**
 * Connexion de l'administrateur de la plateforme ZAFF : identifiants dans l'environnement
 * (PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD), aucun compte en base.
 * Le jeton porte `platform: true` : il ouvre l'espace admin (catalogue global) mais jamais les données d'une boutique.
 */
@Injectable()
export class PlatformAuthService {
  /** Échecs récents par adresse IP (protection contre les essais de mots de passe) */
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  get enabled() {
    return !!this.config.get<string | null>('platformAdmin.email') && !!this.config.get<string | null>('platformAdmin.password');
  }

  private same(a: string, b: string) {
    // Comparaison à temps constant (empreintes de même longueur)
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  }

  async login(email: string, password: string, ip = 'inconnue') {
    if (!this.enabled) throw new ServiceUnavailableException("L'espace administrateur n'est pas configuré sur ce serveur.");
    const now = Date.now();
    const f = this.failures.get(ip);
    if (f && f.count >= MAX_FAILURES && f.until > now) {
      const min = Math.ceil((f.until - now) / 60000);
      throw new HttpException(`Trop d'essais. Réessayez dans ${min} minute${min > 1 ? 's' : ''}.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const expectedEmail = this.config.get<string>('platformAdmin.email')!;
    const expectedPassword = this.config.get<string>('platformAdmin.password')!;
    const emailOk = this.same((email || '').trim().toLowerCase(), expectedEmail);
    const passwordOk = expectedPassword.startsWith('$2')
      ? await bcrypt.compare(password || '', expectedPassword)
      : this.same(password || '', expectedPassword);

    if (!emailOk || !passwordOk) {
      const count = f && f.until > now ? f.count + 1 : 1;
      this.failures.set(ip, { count, until: now + LOCK_MS });
      throw new UnauthorizedException('E-mail ou mot de passe administrateur incorrect.');
    }
    this.failures.delete(ip);

    const accessToken = this.jwt.sign(
      { sub: 'platform-admin', role: Role.SUPERADMIN, platform: true, email: expectedEmail, name: 'Administrateur ZAFF' },
      { expiresIn: '12h' },
    );
    return { accessToken, admin: { email: expectedEmail, name: 'Administrateur ZAFF' } };
  }
}
