import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { SalesModule } from '../sales/sales.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [EstablishmentsModule, SalesModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
