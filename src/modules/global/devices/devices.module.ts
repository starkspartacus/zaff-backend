import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { ImagesModule } from '../images/images.module';
import { GlobalDevice, GlobalDeviceSchema } from './schemas/global-device.schema';
import { DevicesService } from './devices.service';
import { DevicesCatalogController, PlatformDevicesController } from './devices.controller';
import { PlatformAdminGuard } from '../platform/platform.guard';

@Module({
  imports: [MongooseModule.forFeature([{ name: GlobalDevice.name, schema: GlobalDeviceSchema }], GLOBAL_CONNECTION), ImagesModule],
  controllers: [DevicesCatalogController, PlatformDevicesController],
  providers: [DevicesService, PlatformAdminGuard],
  exports: [DevicesService],
})
export class DevicesModule {}
