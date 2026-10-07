import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [EstablishmentsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
