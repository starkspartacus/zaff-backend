import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { CatalogImage, CatalogImageSchema } from './schemas/catalog-image.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CatalogImage.name, schema: CatalogImageSchema }], GLOBAL_CONNECTION), EstablishmentsModule],
  controllers: [ImagesController],
  providers: [ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}
