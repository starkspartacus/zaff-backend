import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { ReferenceCategory, ReferenceCategoryDocument } from './schemas/reference-category.schema';

const SEED: Array<Omit<ReferenceCategory, 'order'>> = [
  { name: 'Smartphones', slug: 'smartphones', icon: 'smartphone', serialTracked: true, brands: ['Apple', 'Samsung', 'Tecno', 'Infinix', 'Itel', 'Xiaomi', 'Oppo', 'Huawei', 'Google', 'Nokia'] },
  { name: 'Ordinateurs portables', slug: 'ordinateurs-portables', icon: 'laptop', serialTracked: true, brands: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus', 'Acer', 'MSI', 'Microsoft'] },
  { name: 'Ordinateurs de bureau', slug: 'ordinateurs-de-bureau', icon: 'monitor', serialTracked: true, brands: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus', 'Acer'] },
  { name: 'Tablettes', slug: 'tablettes', icon: 'tablet', serialTracked: true, brands: ['Apple', 'Samsung', 'Lenovo', 'Huawei', 'Xiaomi', 'Tecno'] },
  { name: 'Écrans', slug: 'ecrans', icon: 'monitor', serialTracked: true, brands: ['Samsung', 'LG', 'Dell', 'HP', 'AOC', 'Asus', 'Philips'] },
  { name: 'Imprimantes', slug: 'imprimantes', icon: 'printer', serialTracked: true, brands: ['HP', 'Canon', 'Epson', 'Brother', 'Xerox'] },
  { name: 'Montres connectées', slug: 'montres-connectees', icon: 'watch', serialTracked: true, brands: ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'Garmin'] },
  { name: 'Audio', slug: 'audio', icon: 'headphones', serialTracked: false, brands: ['JBL', 'Sony', 'Apple', 'Samsung', 'Oraimo', 'Anker'] },
  { name: 'Réseau', slug: 'reseau', icon: 'router', serialTracked: true, brands: ['TP-Link', 'Huawei', 'Cisco', 'Ubiquiti', 'Netgear'] },
  { name: 'Stockage', slug: 'stockage', icon: 'hard-drive', serialTracked: false, brands: ['Samsung', 'SanDisk', 'Kingston', 'Seagate', 'WD', 'Toshiba'] },
  { name: 'Composants', slug: 'composants', icon: 'cpu', serialTracked: false, brands: ['Intel', 'AMD', 'Nvidia', 'Corsair', 'Kingston', 'Crucial'] },
  { name: 'Accessoires', slug: 'accessoires', icon: 'cable', serialTracked: false, brands: ['Oraimo', 'Anker', 'Baseus', 'Ugreen', 'Logitech', 'Apple', 'Samsung'] },
  { name: 'Consoles & Jeux', slug: 'consoles-jeux', icon: 'gamepad', serialTracked: true, brands: ['Sony', 'Microsoft', 'Nintendo'] },
];

@Injectable()
export class ReferenceService implements OnModuleInit {
  private readonly logger = new Logger(ReferenceService.name);
  private cache: { at: number; data: ReferenceCategory[] } | null = null;

  constructor(
    @InjectModel(ReferenceCategory.name, GLOBAL_CONNECTION)
    private readonly categoryModel: Model<ReferenceCategoryDocument>,
  ) {}

  async onModuleInit() {
    try {
      if ((await this.categoryModel.estimatedDocumentCount()) === 0) {
        await this.categoryModel.insertMany(SEED.map((c, order) => ({ ...c, order })));
        this.logger.log(`Reference catalog seeded (${SEED.length} categories)`);
      }
    } catch (e: any) {
      this.logger.warn(`Reference catalog seed skipped: ${e.message}`);
    }
  }

  /** Données quasi statiques : mises en cache 10 minutes */
  async getCatalog() {
    if (this.cache && Date.now() - this.cache.at < 10 * 60 * 1000) return this.cache.data;
    const data = await this.categoryModel.find({}, { __v: 0 }).sort({ order: 1, name: 1 }).lean().exec();
    this.cache = { at: Date.now(), data };
    return data;
  }
}
