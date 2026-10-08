import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { ImagesModule } from '../../global/images/images.module';
import { DevicesModule } from '../../global/devices/devices.module';

@Module({
  imports: [EstablishmentsModule, ImagesModule, DevicesModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
