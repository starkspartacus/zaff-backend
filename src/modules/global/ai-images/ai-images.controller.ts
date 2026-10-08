import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../platform/platform.guard';
import { AiImagesService } from './ai-images.service';

class JobDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Matches(/^[a-f0-9]{24}$/, { each: true }) deviceIds?: string[];
  @IsOptional() @IsIn(['missing-popular']) selection?: 'missing-popular';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsBoolean() auto?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(100) minScore?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8) perDevice?: number;
}

class CandidatesQueryDto {
  @IsOptional() @IsIn(['pending', 'published', 'rejected', 'failed']) status?: string;
  @IsOptional() @Matches(/^[a-f0-9]{24}$/) jobId?: string;
  @IsOptional() @Matches(/^[a-f0-9]{24}$/) deviceId?: string;
}

class PublishDto {
  @IsOptional() @IsString() @MaxLength(60) color?: string | null;
}

class PublishManyDto {
  @IsOptional() @IsArray() @ArrayMaxSize(300) @Matches(/^[a-f0-9]{24}$/, { each: true }) ids?: string[];
  @IsOptional() @Matches(/^[a-f0-9]{24}$/) jobId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(100) minScore?: number;
}

class PreviewQueryDto {
  @IsOptional() @IsIn(['thumb', 'full']) size?: 'thumb' | 'full';
}

/** Recherche des photos d'appareils par l'IA (administrateur de la plateforme) */
@ApiTags('Plateforme - Photos par l\'IA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/ai-images')
export class AiImagesController {
  constructor(private readonly ai: AiImagesService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Get('jobs')
  jobs() {
    return this.ai.listJobs();
  }

  @Post('jobs')
  @ApiOperation({ summary: 'Lancer une recherche de photos (appareils choisis, ou sans photo les plus utilisés)' })
  createJob(@Body() dto: JobDto) {
    return this.ai.createJob(dto);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.ai.cancelJob(id);
  }

  @Get('candidates')
  candidates(@Query() q: CandidatesQueryDto) {
    return this.ai.listCandidates(q);
  }

  @Get('candidates/:id/preview')
  @Header('Cache-Control', 'private, max-age=3600')
  async preview(@Param('id') id: string, @Query() q: PreviewQueryDto, @Res() res: Response) {
    const data = await this.ai.preview(id, q.size || 'thumb');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }

  @Post('candidates/:id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publier la photo sur l\'appareil (UploadThing + boutiques)' })
  publish(@Param('id') id: string, @Body() dto: PublishDto) {
    return this.ai.publish(id, dto.color);
  }

  @Post('candidates/:id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string) {
    return this.ai.reject(id);
  }

  @Post('candidates/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publier plusieurs photos (choisies, ou toutes celles d\'un lot au-dessus d\'une note)' })
  publishMany(@Body() dto: PublishManyDto) {
    return this.ai.publishMany(dto);
  }
}
