import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { ReferenceCategory, ReferenceCategorySchema } from './schemas/reference-category.schema';
import { ReferenceService } from './reference.service';
import { ReferenceController } from './reference.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: ReferenceCategory.name, schema: ReferenceCategorySchema }], GLOBAL_CONNECTION)],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
