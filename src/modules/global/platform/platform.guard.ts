import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Réservé au jeton de l'administrateur de la plateforme (`platform: true`).
 * L'e-mail doit toujours correspondre à PLATFORM_ADMIN_EMAIL : changer ou retirer la variable ferme les sessions ouvertes.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    const email = this.config.get<string | null>('platformAdmin.email');
    if (!user?.platform || !email || user.email !== email) throw new ForbiddenException("Réservé à l'administrateur de la plateforme ZAFF.");
    return true;
  }
}
