import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { CatalogImage, CatalogImageSchema } from './schemas/catalog-image.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { PlatformAdminGuard } from '../platform/platform.guard';
import { ConfigService } from '@nestjs/config';
import { DatabaseStorage, MEDIA_STORAGE, UploadThingStorage } from './media-storage';
import { AiCoreModule } from '../ai-images/ai-core.module';
import { PhotoStudioService } from './photo-studio.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CatalogImage.name, schema: CatalogImageSchema }], GLOBAL_CONNECTION), EstablishmentsModule, AiCoreModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    PhotoStudioService,
    PlatformAdminGuard,
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
