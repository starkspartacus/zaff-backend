import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { CodeLabelsController } from './code-labels.controller';
import { CodeLabelsService } from './code-labels.service';

@Module({
  imports: [EstablishmentsModule],
  controllers: [CodeLabelsController],
  providers: [CodeLabelsService],
})
export class CodeLabelsModule {}
