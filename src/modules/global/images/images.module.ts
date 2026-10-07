import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { CatalogImage, CatalogImageSchema } from './schemas/catalog-image.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseStorage, MEDIA_STORAGE, UploadThingStorage } from './media-storage';

@Module({
  imports: [MongooseModule.forFeature([{ name: CatalogImage.name, schema: CatalogImageSchema }], GLOBAL_CONNECTION), EstablishmentsModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    {
      // UploadThing si UPLOADTHING_TOKEN est défini, sinon MongoDB
      provide: MEDIA_STORAGE,
      useFactory: (config: ConfigService) => {
        const token = config.get<string | null>('media.uploadthingToken');
        return token ? UploadThingStorage.fromToken(token) : new DatabaseStorage();
      },
      inject: [ConfigService],
    },
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
