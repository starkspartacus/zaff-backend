import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { RepairsModule } from '../repairs/repairs.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [EstablishmentsModule, RepairsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
