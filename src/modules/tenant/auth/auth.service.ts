import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EstablishmentsService } from '../../global/establishments/establishments.service';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { TenantUser, TenantUserSchema } from '../common/schemas/tenant-user.schema';
import { LoginDto } from './dto/login.dto';
import { normalizeRole } from '../../../common/enums/role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly establishmentsService: EstablishmentsService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-().]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
    return cleaned;
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const isPhone = !identifier.includes('@');
    const normalized = isPhone ? this.normalizePhone(identifier) : identifier.toLowerCase();

    let establishment: any = null;

    if (dto.tenantSlug) {
      establishment = await this.establishmentsService.findBySlug(dto.tenantSlug);
      if (!establishment) {
        throw new NotFoundException(`Établissement '${dto.tenantSlug}' introuvable.`);
      }
    } else {
      // Résolution automatique parmi les établissements actifs
      const establishments = await this.establishmentsService.findAll();
      for (const est of establishments) {
        if (est.status !== 'active') continue;
        const userModel = this.tenantConnectionService.getModel<TenantUser>(
          est.databaseName,
          TenantUser.name,
          TenantUserSchema,
        );
        const found = await userModel.findOne({
          $or: [{ phone: normalized }, { email: normalized }],
        });
        if (found) {
          establishment = est;
          break;
        }
      }
      if (!establishment) {
        throw new UnauthorizedException('Identifiants invalides ou aucun établissement associé.');
      }
    }

    // Recherche de l'utilisateur dans la base du tenant
    const userModel = this.tenantConnectionService.getModel<TenantUser>(
      establishment.databaseName,
      TenantUser.name,
      TenantUserSchema,
    );
    const user = await userModel.findOne({
      $or: [{ phone: normalized }, { email: normalized }],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Identifiants incorrects ou compte inactif.');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    const payload = {
      sub: user._id,
      tenantId: establishment._id,
      tenantSlug: establishment.slug,
      tenantDb: establishment.databaseName,
      role: normalizeRole(user.role),
      name: user.name,
      phone: user.phone,
      email: user.email,
    };

    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: normalizeRole(user.role),
      },
      establishment: {
        id: establishment._id,
        name: establishment.name,
        slug: establishment.slug,
        currency: establishment.currency,
      },
    };
  }
}
