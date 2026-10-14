import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { UnitsModule } from '../units/units.module';

@Module({
  imports: [EstablishmentsModule, UnitsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
