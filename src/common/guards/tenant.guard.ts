import { Injectable, CanActivate, ExecutionContext, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EstablishmentsService } from '../../modules/global/establishments/establishments.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // 1. Depuis le token JWT de l'utilisateur authentifié
    let slug = req.user?.tenantSlug;
    let id = req.user?.tenantId;

    // 2. Ou depuis les en-têtes HTTP de la requête
    if (!slug && !id) {
      slug = req.headers['x-tenant-slug'];
      id = req.headers['x-tenant-id'];
    }

    if (!slug && !id) {
      throw new BadRequestException('Aucun établissement spécifié (En-tête x-tenant-slug manquant ou session invalide).');
    }

    const establishment = slug
      ? await this.establishmentsService.findBySlug(slug)
      : await this.establishmentsService.findById(id);

    if (!establishment) {
      throw new BadRequestException(`Établissement '${slug || id}' introuvable.`);
    }

    if (establishment.status === 'suspended') {
      throw new ForbiddenException(`L\'établissement '${establishment.name}' est actuellement suspendu.`);
    }

    req.tenant = establishment;
    return true;
  }
}
