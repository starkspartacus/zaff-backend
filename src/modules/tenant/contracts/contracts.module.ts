import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { DevicesModule } from '../../global/devices/devices.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PublicWarrantyController } from './public-warranty.controller';
import { WARRANTY_CODES, WarrantyCodes } from './warranty-code';

@Module({
  imports: [EstablishmentsModule, DevicesModule],
  controllers: [ContractsController, PublicWarrantyController],
  providers: [
    ContractsService,
    {
      provide: WARRANTY_CODES,
      useFactory: (config: ConfigService) => new WarrantyCodes(config.getOrThrow<string>('jwt.secret')),
      inject: [ConfigService],
    },
  ],
})
export class ContractsModule {}
