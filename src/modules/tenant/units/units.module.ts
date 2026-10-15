import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { SalesModule } from '../sales/sales.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';
import { ReceptionsService } from './receptions/receptions.service';
import { ReceptionsController } from './receptions/receptions.controller';

@Module({
  imports: [EstablishmentsModule, SalesModule],
  controllers: [UnitsController, ReceptionsController],
  providers: [UnitsService, ReceptionsService],
  exports: [UnitsService, ReceptionsService],
})
export class UnitsModule {}
