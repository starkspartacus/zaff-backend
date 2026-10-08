import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { Establishment, EstablishmentSchema } from './schemas/establishment.schema';
import { EstablishmentsService } from './establishments.service';
import { EstablishmentsController } from './establishments.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: Establishment.name, schema: EstablishmentSchema }],
      GLOBAL_CONNECTION,
    ),
  ],
  controllers: [EstablishmentsController],
  providers: [EstablishmentsService, RegistrationService],
  exports: [EstablishmentsService, MongooseModule],
})
export class EstablishmentsModule {}
