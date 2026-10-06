import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { TenantUser, TenantUserSchema } from '../common/schemas/tenant-user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly tenantConnectionService: TenantConnectionService) {}

  private getModel(databaseName: string) {
    return this.tenantConnectionService.getModel<TenantUser>(
      databaseName,
      TenantUser.name,
      TenantUserSchema,
    );
  }

  async create(databaseName: string, dto: CreateUserDto) {
    const model = this.getModel(databaseName);
    const existing = await model.findOne({ phone: dto.phone });
    if (existing) {
      throw new ConflictException(`Un utilisateur avec le téléphone '${dto.phone}' existe déjà.`);
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await model.create({
      ...dto,
      password: hashedPassword,
      isActive: true,
    });
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

  async update(databaseName: string, id: string, dto: UpdateUserDto) {
    const model = this.getModel(databaseName);
    const updates: any = { ...dto };
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const user = await model.findByIdAndUpdate(id, updates, { new: true, projection: { password: 0 } }).exec();
    if (!user) throw new NotFoundException('Utilisateur non trouvé.');
    return user;
  }

  async remove(databaseName: string, id: string) {
    const model = this.getModel(databaseName);
    const res = await model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Utilisateur non trouvé.');
    return { message: 'Utilisateur supprimé avec succès.' };
  }
}
