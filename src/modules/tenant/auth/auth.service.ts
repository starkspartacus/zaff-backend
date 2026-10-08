import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EstablishmentsService } from '../../global/establishments/establishments.service';
import { DirectoryService } from '../../global/directory/directory.service';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { TenantUser, TenantUserSchema } from '../common/schemas/tenant-user.schema';
import { LoginDto } from './dto/login.dto';
import { normalizeRole } from '../../../common/enums/role.enum';
import { normalizeIdentifier } from '../../../common/utils/identifier';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly establishmentsService: EstablishmentsService,
    private readonly directoryService: DirectoryService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly jwtService: JwtService,
  ) {}

  private userModel(databaseName: string) {
    return this.tenantConnectionService.getModel<TenantUser>(databaseName, TenantUser.name, TenantUserSchema);
  }

  /** Compte d'un établissement correspondant à l'identifiant (anciens numéros saisis avec espaces inclus) */
  private findUser(databaseName: string, identifier: string, raw: string) {
    return this.userModel(databaseName).findOne({
      $or: [{ phone: identifier }, { phone: raw.trim() }, { email: identifier }],
    });
  }

  /** Établissements candidats : annuaire global, ou parcours complet pour les comptes antérieurs à l'annuaire */
  private async candidateEstablishments(identifier: string): Promise<any[]> {
    const entries = await this.directoryService.findByIdentifier(identifier);
    if (entries.length) {
      const ests = await Promise.all(entries.map((e) => this.establishmentsService.findById(String(e.establishmentId)).catch(() => null)));
      return ests.filter(Boolean);
    }
    const all = await this.establishmentsService.findAll();
    const found: any[] = [];
    for (const est of all) {
      if (est.status === 'active' && (await this.findUser(est.databaseName, identifier, identifier))) found.push(est);
    }
    return found;
  }

  async login(dto: LoginDto) {
    // Téléphone : le pays choisi donne l'indicatif (07 07… + CI → +2250707…) ; e-mail : en minuscules
    const identifier = normalizeIdentifier(dto.identifier, dto.countryCode);

    let candidates: any[];
    if (dto.tenantSlug) {
      const est = await this.establishmentsService.findBySlug(dto.tenantSlug);
      if (!est) throw new NotFoundException(`Établissement '${dto.tenantSlug}' introuvable.`);
      candidates = [est];
    } else {
      candidates = await this.candidateEstablishments(identifier);
    }

    // Vérifie le mot de passe dans chaque boutique candidate
    const matches: Array<{ establishment: any; user: any }> = [];
    for (const establishment of candidates) {
      const user = await this.findUser(establishment.databaseName, identifier, dto.identifier);
      if (user && user.isActive && (await bcrypt.compare(dto.password, user.password))) {
        matches.push({ establishment, user });
      }
    }

    if (matches.length === 0) {
      throw new UnauthorizedException('Identifiants incorrects ou compte inactif.');
    }
    if (matches.length > 1) {
      // Même identifiant et même mot de passe dans plusieurs boutiques : l'utilisateur choisit
      throw new ConflictException({
        message: 'Ce compte existe dans plusieurs boutiques. Choisissez la boutique à ouvrir.',
        details: {
          establishments: matches.map((m) => ({ slug: m.establishment.slug, name: m.establishment.name })),
        },
      });
    }

    const { establishment, user } = matches[0];
    if (establishment.status === 'suspended') {
      throw new ForbiddenException(`L'établissement '${establishment.name}' est actuellement suspendu.`);
    }

    // Comptes créés avant l'annuaire global : on les y ajoute au passage
    await this.directoryService.syncUser(establishment._id, user).catch((e) =>
      this.logger.warn(`Directory sync failed for ${user._id}: ${e.message}`),
    );

    const role = normalizeRole(user.role);
    const payload = {
      sub: user._id,
      tenantId: establishment._id,
      tenantSlug: establishment.slug,
      tenantDb: establishment.databaseName,
      role,
      name: user.name,
      phone: user.phone,
      email: user.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role },
      establishment: {
        id: establishment._id,
        name: establishment.name,
        slug: establishment.slug,
        currency: establishment.currency,
        currencyCode: establishment.currencyCode || null,
        countryCode: establishment.countryCode || null,
        city: establishment.city || null,
      },
    };
  }
}
