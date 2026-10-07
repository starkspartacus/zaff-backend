import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { Establishment, EstablishmentDocument } from './schemas/establishment.schema';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Injectable()
export class EstablishmentsService {
  private readonly logger = new Logger(EstablishmentsService.name);

  constructor(
    @InjectModel(Establishment.name, GLOBAL_CONNECTION)
    private readonly establishmentModel: Model<EstablishmentDocument>,
  ) {}

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

  /** Met à jour une section des paramètres de la boutique (ex. returnPolicy) */
  async updateSettings(id: string, section: string, value: unknown): Promise<Establishment> {
    if (!/^[a-zA-Z]+$/.test(section)) throw new Error('Section de paramètres invalide');
    const est = await this.establishmentModel
      .findByIdAndUpdate(id, { $set: { [`settings.${section}`]: value } }, { new: true })
      .exec();
    if (!est) throw new NotFoundException('Établissement non trouvé.');
    return est;
  }

  async toggleStatus(id: string): Promise<Establishment> {
    const est = await this.findById(id);
    const newStatus = est.status === 'active' ? 'suspended' : 'active';
    return this.establishmentModel.findByIdAndUpdate(id, { status: newStatus }, { new: true }).exec() as any;
  }
}
