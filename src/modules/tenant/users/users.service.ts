import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { TenantUser, TenantUserSchema } from '../common/schemas/tenant-user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DirectoryService } from '../../global/directory/directory.service';
import { toE164 } from '../../../common/geo/geo';

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly directoryService: DirectoryService,
  ) {}

  private getModel(databaseName: string) {
    return this.tenantConnectionService.getModel<TenantUser>(
      databaseName,
      TenantUser.name,
      TenantUserSchema,
    );
  }

  /** Numéro au format international du pays de la boutique (07 07… → +2250707…) */
  private phoneOf(raw: string, countryCode?: string | null) {
    const phone = toE164(raw, countryCode);
    if (!phone) throw new BadRequestException('Numéro de téléphone invalide.');
    return phone;
  }

  /** Un numéro / un e-mail = un seul compte sur toute la plateforme */
  private async assertAvailable(identifier: string | null | undefined, exceptUserId?: string) {
    if (!identifier) return;
    const owners = await this.directoryService.findByIdentifier(identifier);
    if (owners.some((o) => String(o.tenantUserId) !== exceptUserId)) {
      const isEmail = identifier.includes('@');
      throw new ConflictException({
        message: isEmail ? 'Cette adresse e-mail est déjà utilisée par un compte ZAFF.' : 'Ce numéro de téléphone est déjà utilisé par un compte ZAFF.',
        details: { code: isEmail ? 'EMAIL_TAKEN' : 'PHONE_TAKEN', field: isEmail ? 'email' : 'phone' },
      });
    }
  }

  async create(databaseName: string, establishmentId: unknown, dto: CreateUserDto, countryCode?: string | null) {
    const model = this.getModel(databaseName);
    const phone = this.phoneOf(dto.phone, countryCode);
    if (dto.email) dto.email = dto.email.trim().toLowerCase();
    await this.assertAvailable(phone);
    await this.assertAvailable(dto.email);
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await model.create({
      ...dto,
      phone,
      password: hashedPassword,
      isActive: true,
    });
    await this.directoryService.syncUser(establishmentId, user);
    const { password, ...safeUser } = (user as any).toObject();
    return safeUser;
  }

  async findAll(databaseName: string) {
    const model = this.getModel(databaseName);
    return model.find({}, { password: 0 }).sort({ createdAt: -1 }).exec();
  }

  async findById(databaseName: string, id: string) {
    const model = this.getModel(databaseName);
    const user = await model.findById(id, { password: 0 }).exec();
    if (!user) throw new NotFoundException('Utilisateur non trouvé.');
    return user;
  }

  async update(databaseName: string, establishmentId: unknown, id: string, dto: UpdateUserDto, countryCode?: string | null) {
    const model = this.getModel(databaseName);
    const updates: any = { ...dto };
    if (updates.phone) {
      updates.phone = this.phoneOf(updates.phone, countryCode);
      await this.assertAvailable(updates.phone, id);
    }
    if (updates.email) {
      updates.email = updates.email.trim().toLowerCase();
      await this.assertAvailable(updates.email, id);
    }
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const user = await model.findByIdAndUpdate(id, updates, { new: true, projection: { password: 0 } }).exec();
    if (!user) throw new NotFoundException('Utilisateur non trouvé.');
    await this.directoryService.syncUser(establishmentId, user);
    return user;
  }

  async remove(databaseName: string, establishmentId: unknown, id: string) {
    const model = this.getModel(databaseName);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Utilisateur non trouvé.');
    await this.directoryService.removeUser(establishmentId, id);
    return { message: 'Utilisateur supprimé avec succès.' };
  }
}
