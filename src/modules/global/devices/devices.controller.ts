import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../platform/platform.guard';
import { ImagesService, MAX_IMAGE_BYTES } from '../images/images.service';
import { DevicesService } from './devices.service';

class SpecDto {
  @IsString() @MaxLength(40) label: string;
  @IsString() @MaxLength(160) value: string;
}

class DeviceDto {
  @Matches(/^[a-z0-9-]{2,60}$/) category: string;
  @IsString() @MaxLength(80) brand: string;
  @IsString() @MaxLength(120) model: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) variants?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) colors?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SpecDto) specs?: SpecDto[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class DeviceUpdateDto {
  @IsOptional() @Matches(/^[a-z0-9-]{2,60}$/) category?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) variants?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) colors?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SpecDto) specs?: SpecDto[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class DeviceQueryDto {
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsIn(['missing', 'with']) photos?: 'missing' | 'with';
  @IsOptional() @IsIn(['name', 'popular']) sort?: 'name' | 'popular';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

class PhotoDto {
  @IsOptional() @IsString() @MaxLength(60) @Transform(({ value }) => (value === '' ? undefined : value)) color?: string;
}

type Files = { file?: { buffer: Buffer; size: number }[]; thumb?: { buffer: Buffer; size: number }[] };

/** Catalogue global lu par les boutiques */
@ApiTags('Global - Catalogue des appareils')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('global/reference')
export class DevicesCatalogController {
  constructor(private readonly devices: DevicesService) {}

  @Get('devices')
  @Header('Cache-Control', 'private, max-age=300')
  @ApiOperation({ summary: 'Appareils du catalogue global (modèles, capacités, coloris, photos) pour créer un produit' })
  catalog() {
    return this.devices.catalog();
  }
}

/** Administration du catalogue global (administrateur de la plateforme) */
@ApiTags('Plateforme - Catalogue global des appareils')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/devices')
export class PlatformDevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly images: ImagesService,
  ) {}

  @Get()
  list(@Query() q: DeviceQueryDto) {
    return this.devices.list(q);
  }

  @Get('stats')
  stats() {
    return this.devices.stats();
  }

  @Get('reports')
  @ApiOperation({ summary: 'Photos signalées par les boutiques' })
  reports() {
    return this.images.reported();
  }

  @Post('reports/:imageId/keep')
  @HttpCode(200)
  keep(@Param('imageId') imageId: string) {
    return this.images.clearReports(imageId);
  }

  @Delete('reports/:imageId')
  removeReported(@Param('imageId') imageId: string) {
    return this.devices.removeReportedPhoto(imageId);
  }

  @Post('sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalcul : boutiques par appareil, demandes d\'ajout, photos transmises aux produits' })
  sync() {
    return this.devices.sync();
  }

  @Get('usage')
  usage() {
    return this.images.usage(null);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.devices.get(id);
  }

  @Post()
  create(@Body() dto: DeviceDto) {
    return this.devices.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: DeviceUpdateDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.devices.remove(id);
  }

  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'thumb', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_IMAGE_BYTES, files: 2 } },
    ),
  )
  @ApiOperation({ summary: "Ajouter une photo conforme à l'appareil (et au coloris)" })
  addPhoto(@Param('id') id: string, @UploadedFiles() files: Files | undefined, @Body() dto: PhotoDto) {
    return this.devices.addPhoto(id, files?.file?.[0], files?.thumb?.[0], dto.color);
  }

  @Patch(':id/photos/:imageId/default')
  setDefault(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.devices.setDefaultPhoto(id, imageId);
  }

  @Delete(':id/photos/:imageId')
  removePhoto(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.devices.removePhoto(id, imageId);
  }
}

class MergeDto {
  @IsString() @Matches(/^[a-f0-9]{24}$/) deviceId: string;
}

class RequestQueryDto {
  @IsOptional() @IsIn(['open', 'added', 'dismissed']) status?: 'open' | 'added' | 'dismissed';
}

/** Modèles saisis par les boutiques et absents du catalogue (demandes d'ajout automatiques) */
@ApiTags('Plateforme - Catalogue global des appareils')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/device-requests')
export class PlatformDeviceRequestsController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@Query() q: RequestQueryDto) {
    return this.devices.requestsList(q.status);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ajouter le modèle au catalogue ; les produits des boutiques concernées y sont rattachés' })
  accept(@Param('id') id: string, @Body() dto: DeviceDto) {
    return this.devices.acceptRequest(id, dto);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Doublon : rattacher la demande à un appareil existant (écriture mémorisée comme alias)' })
  merge(@Param('id') id: string, @Body() dto: MergeDto) {
    return this.devices.mergeRequest(id, dto.deviceId);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@Param('id') id: string) {
    return this.devices.dismissRequest(id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Param('id') id: string) {
    return this.devices.reopenRequest(id);
  }
}
