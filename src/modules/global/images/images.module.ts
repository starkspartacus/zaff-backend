import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { CatalogImage, CatalogImageSchema } from './schemas/catalog-image.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { PlatformAdminGuard } from '../platform/platform.guard';
import { ConfigService } from '@nestjs/config';
import { DatabaseStorage, MEDIA_STORAGE, UploadThingStorage, cleanUploadThingToken, uploadThingTokenProblem } from './media-storage';
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
        const token = cleanUploadThingToken(config.get<string | null>('media.uploadthingToken'));
        if (!token) return new DatabaseStorage();
        const problem = uploadThingTokenProblem(token);
        if (problem) {
          // Mauvais jeton : on ne bloque pas les boutiques, les photos restent dans MongoDB
          new Logger('UploadThing').error(`UPLOADTHING_TOKEN inutilisable : ${problem} Photos stockées dans MongoDB en attendant.`);
          return new DatabaseStorage();
        }
        return UploadThingStorage.fromToken(token);
      },
      inject: [ConfigService],
    },
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
