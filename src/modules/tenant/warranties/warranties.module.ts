import { Module } from '@nestjs/common';
import { WarrantiesService } from './warranties.service';
import { WarrantiesController } from './warranties.controller';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';

@Module({
  imports: [EstablishmentsModule],
  controllers: [WarrantiesController],
  providers: [WarrantiesService],
  exports: [WarrantiesService],
})
export class WarrantiesModule {}
