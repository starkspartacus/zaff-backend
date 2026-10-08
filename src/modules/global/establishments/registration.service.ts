import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Role } from '../../../common/enums/role.enum';
import { findCity, findCountry, citiesOf, toE164 } from '../../../common/geo/geo';
import { TenantUser, TenantUserSchema } from '../../tenant/common/schemas/tenant-user.schema';
import { DirectoryService } from '../directory/directory.service';
import { Establishment, EstablishmentDocument } from './schemas/establishment.schema';
import { RegisterEstablishmentDto, RegistrationCheckDto } from './dto/register-establishment.dto';

/** Codes d'erreur stables : le frontend les affiche dans une fenêtre claire */
export type RegistrationConflict = 'PHONE_TAKEN' | 'EMAIL_TAKEN';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectModel(Establishment.name, GLOBAL_CONNECTION)
    private readonly establishmentModel: Model<EstablishmentDocument>,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly directoryService: DirectoryService,
  ) {}

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'boutique';
  }

  /** Identifiant interne unique, invisible pour l'utilisateur (zaff-phone, zaff-phone-2…) */
  private async uniqueSlug(name: string, city: string) {
    const base = this.slugify(name);
    const candidates = [base, `${base}-${this.slugify(city)}`, ...Array.from({ length: 30 }, (_, i) => `${base}-${i + 2}`)];
    for (const slug of candidates) {
      if (!(await this.establishmentModel.exists({ slug }))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /** Numéro et e-mail déjà utilisés sur la plateforme ? (une seule fois sur toute la plateforme) */
  async check(dto: RegistrationCheckDto) {
    const result: { phone?: { valid: boolean; e164: string | null; taken: boolean }; email?: { valid: boolean; taken: boolean } } = {};
    if (dto.phone) {
      const e164 = toE164(dto.phone, dto.countryCode);
      result.phone = { valid: !!e164, e164, taken: !!e164 && (await this.directoryService.findByIdentifier(e164)).length > 0 };
    }
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      result.email = { valid, taken: valid && (await this.directoryService.findByIdentifier(email)).length > 0 };
    }
    return result;
  }

  private conflict(code: RegistrationConflict, message: string) {
    return new ConflictException({ message, details: { code, field: code === 'PHONE_TAKEN' ? 'ownerPhone' : 'ownerEmail' } });
  }

  async register(dto: RegisterEstablishmentDto) {
    // 1. Localisation : toujours choisie dans les listes quand elles existent
    const country = findCountry(dto.countryCode);
    if (!country) throw new BadRequestException('Choisissez votre pays dans la liste.');
    let city = dto.city;
    let commune = dto.commune || null;
    if (citiesOf(country.code).length) {
      const known = findCity(country.code, dto.city);
      if (!known) throw new BadRequestException(`Choisissez votre ville dans la liste (${country.name}).`);
      city = known.name;
      if (known.communes?.length) {
        if (known.communeRequired && !commune) throw new BadRequestException(`Choisissez votre commune à ${known.name}.`);
        if (commune) {
          const c = known.communes.find((x) => x.localeCompare(commune!, 'fr', { sensitivity: 'base' }) === 0);
          if (!c) throw new BadRequestException(`Commune inconnue à ${known.name}.`);
          commune = c;
        }
      }
    }

    // 2. Téléphones au format international du pays choisi (unique par pays : +225 07… ≠ +221 07…)
    const ownerPhone = toE164(dto.ownerPhone, country.code);
    if (!ownerPhone) throw new BadRequestException(`Numéro de téléphone invalide pour ${country.name} (${country.dialCode}).`);
    const shopPhone = dto.shopPhone ? toE164(dto.shopPhone, country.code) : null;
    if (dto.shopPhone && !shopPhone) throw new BadRequestException(`Numéro de la boutique invalide pour ${country.name}.`);

    // 3. Unicité sur toute la plateforme
    const taken = await this.check({ countryCode: country.code, phone: ownerPhone, email: dto.ownerEmail });
    if (taken.phone?.taken) throw this.conflict('PHONE_TAKEN', 'Ce numéro de téléphone est déjà utilisé par un compte ZAFF.');
    if (taken.email?.taken) throw this.conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée par un compte ZAFF.');

    // 4. Création : boutique, base dédiée, compte propriétaire — annulée entièrement si une étape échoue
    const slug = await this.uniqueSlug(dto.name, city);
    const databaseName = `zaff_tenant_${slug.replace(/-/g, '_')}`;
    const establishment = await this.establishmentModel.create({
      name: dto.name,
      slug,
      databaseName,
      phone: shopPhone || ownerPhone,
      email: dto.ownerEmail,
      address: dto.address || null,
      countryCode: country.code,
      city,
      commune,
      currency: country.currency.symbol,
      currencyCode: country.currency.code,
      status: 'active',
      settings: {},
    });

    const users = this.tenantConnectionService.getModel<TenantUser>(databaseName, TenantUser.name, TenantUserSchema);
    let owner: any = null;
    try {
      owner = await users.create({
        name: dto.ownerName,
        email: dto.ownerEmail,
        phone: ownerPhone,
        password: await bcrypt.hash(dto.password, 10),
        role: Role.ADMIN,
        isActive: true,
      });
      await this.directoryService.syncUser(establishment._id, owner);

      // Inscriptions simultanées avec le même numéro / e-mail : la plus récente est annulée
      const [phoneOwners, emailOwners] = await Promise.all([
        this.directoryService.findByIdentifier(ownerPhone),
        this.directoryService.findByIdentifier(dto.ownerEmail),
      ]);
      if (phoneOwners.length > 1) throw this.conflict('PHONE_TAKEN', 'Ce numéro de téléphone est déjà utilisé par un compte ZAFF.');
      if (emailOwners.length > 1) throw this.conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée par un compte ZAFF.');
    } catch (e) {
      if (owner) {
        await this.directoryService.removeUser(establishment._id, owner._id).catch(() => undefined);
        await users.deleteOne({ _id: owner._id }).catch(() => undefined);
      }
      await this.establishmentModel.deleteOne({ _id: establishment._id }).catch(() => undefined);
      throw e;
    }

    this.logger.log(`Boutique « ${establishment.name} » inscrite (${country.code}, ${city}${commune ? ` / ${commune}` : ''})`);
    // Rien d'interne (base de données, statut) n'est renvoyé au navigateur
    return {
      id: establishment._id,
      name: establishment.name,
      slug,
      currency: establishment.currency,
      currencyCode: establishment.currencyCode || null,
      countryCode: country.code,
      city,
      commune,
      ownerPhone,
      ownerEmail: dto.ownerEmail,
    };
  }
}
