import { Module } from '@nestjs/common';
import { EstablishmentsModule } from '../../global/establishments/establishments.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [EstablishmentsModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
