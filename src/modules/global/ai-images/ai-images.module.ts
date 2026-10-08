import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { DevicesModule } from '../devices/devices.module';
import { PlatformAdminGuard } from '../platform/platform.guard';
import { AiImageCandidate, AiImageCandidateSchema, AiImageJob, AiImageJobSchema } from './ai-images.schemas';
import { AiImagesController } from './ai-images.controller';
import { AiImagesService, PAGE_FETCHER } from './ai-images.service';
import { safeFetch } from './safe-fetch';
import { AI_CLIENT, GeminiClient } from './gemini.client';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: AiImageJob.name, schema: AiImageJobSchema },
        { name: AiImageCandidate.name, schema: AiImageCandidateSchema },
      ],
      GLOBAL_CONNECTION,
    ),
    DevicesModule,
  ],
  controllers: [AiImagesController],
  providers: [AiImagesService, PlatformAdminGuard, { provide: AI_CLIENT, useClass: GeminiClient }, { provide: PAGE_FETCHER, useValue: safeFetch }],
})
export class AiImagesModule {}
