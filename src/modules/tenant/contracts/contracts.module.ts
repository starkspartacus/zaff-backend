import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PublicWarrantyController } from './public-warranty.controller';
import { WARRANTY_CODES, WarrantyCodes } from './warranty-code';

@Module({
  imports: [EstablishmentsModule],
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
