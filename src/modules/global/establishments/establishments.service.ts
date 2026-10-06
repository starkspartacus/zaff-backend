import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { TenantConnectionService } from '../../../database/tenant-connection.service';
import { Establishment, EstablishmentDocument } from './schemas/establishment.schema';
import { TenantUser, TenantUserSchema } from '../../tenant/common/schemas/tenant-user.schema';
import { Role } from '../../../common/enums/role.enum';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Injectable()
export class EstablishmentsService {
  private readonly logger = new Logger(EstablishmentsService.name);

  constructor(
    @InjectModel(Establishment.name, GLOBAL_CONNECTION)
    private readonly establishmentModel: Model<EstablishmentDocument>,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async create(dto: CreateEstablishmentDto): Promise<Establishment> {
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    const existing = await this.establishmentModel.findOne({ slug });
    if (existing) {
      throw new ConflictException(`Un établissement avec le slug '${slug}' existe déjà.`);
    }

    const databaseName = `zaff_tenant_${slug.replace(/-/g, '_')}`;
    const establishment = new this.establishmentModel({
      name: dto.name,
      slug,
      databaseName,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      currency: dto.currency || 'F',
      status: 'active',
    });
    await establishment.save();
    this.logger.log(`Created establishment '${establishment.name}' with DB '${databaseName}'`);

    // Création du premier compte administrateur dans la base dédiée du tenant
    const adminPhone = dto.adminPhone || dto.phone || '+2250102030405';
    const rawPassword = dto.adminPassword || 'Admin1234!';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const userModel = this.tenantConnectionService.getModel<TenantUser>(
      databaseName,
      TenantUser.name,
      TenantUserSchema,
    );
    await userModel.create({
      name: dto.adminName || `Admin ${dto.name}`,
      email: dto.email || null,
      phone: adminPhone,
      password: hashedPassword,
      role: Role.ADMIN,
      isActive: true,
    });
    this.logger.log(`Initial admin user created in tenant DB '${databaseName}'`);

    return establishment;
  }

  async findAll(): Promise<Establishment[]> {
    return this.establishmentModel.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<Establishment> {
    const est = await this.establishmentModel.findById(id).exec();
    if (!est) throw new NotFoundException('Établissement non trouvé.');
    return est;
  }

  async findBySlug(slug: string): Promise<EstablishmentDocument | null> {
    return this.establishmentModel.findOne({ slug: slug.toLowerCase() }).exec();
  }

  async update(id: string, dto: UpdateEstablishmentDto): Promise<Establishment> {
    const est = await this.establishmentModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!est) throw new NotFoundException('Établissement non trouvé.');
    return est;
  }

  async toggleStatus(id: string): Promise<Establishment> {
    const est = await this.findById(id);
    const newStatus = est.status === 'active' ? 'suspended' : 'active';
    return this.establishmentModel.findByIdAndUpdate(id, { status: newStatus }, { new: true }).exec() as any;
  }
}
