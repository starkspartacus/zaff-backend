import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';

@Module({
  imports: [EstablishmentsModule],
  controllers: [StockCountsController],
  providers: [StockCountsService],
})
export class StockCountsModule {}
