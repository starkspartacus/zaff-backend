import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { ImagesModule } from '../images/images.module';
import { GlobalDevice, GlobalDeviceSchema } from './schemas/global-device.schema';
import { DeviceRequest, DeviceRequestSchema } from './schemas/device-request.schema';
import { DeviceUsageService } from './device-usage.service';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { DevicesService } from './devices.service';
import { DevicesCatalogController, PlatformDeviceRequestsController, PlatformDevicesController } from './devices.controller';
import { PlatformAdminGuard } from '../platform/platform.guard';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: GlobalDevice.name, schema: GlobalDeviceSchema },
        { name: DeviceRequest.name, schema: DeviceRequestSchema },
      ],
      GLOBAL_CONNECTION,
    ),
    ImagesModule,
    EstablishmentsModule,
  ],
  controllers: [DevicesCatalogController, PlatformDevicesController, PlatformDeviceRequestsController],
  providers: [DevicesService, DeviceUsageService, PlatformAdminGuard],
  exports: [DevicesService, DeviceUsageService],
})
export class DevicesModule {}
