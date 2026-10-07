import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { CashClosingsController } from './cash-closings.controller';
import { CashClosingsService } from './cash-closings.service';

@Module({
  imports: [EstablishmentsModule],
  controllers: [CashClosingsController],
  providers: [CashClosingsService],
})
export class CashClosingsModule {}
