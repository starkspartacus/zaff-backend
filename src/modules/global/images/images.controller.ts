import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { EstablishmentsService } from '../establishments/establishments.service';
import { ImagesService, MAX_IMAGE_BYTES } from './images.service';

class ImageQueryDto {
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(60) color?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}

class ImageUploadDto {
  @IsString() @MaxLength(80) brand: string;
  @IsString() @MaxLength(120) model: string;
  @IsOptional() @IsString() @MaxLength(60) color?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}

@ApiTags('Global - Images produits (partagées)')
@Controller('global/images')
export class ImagesController {
  constructor(
    private readonly images: ImagesService,
    private readonly establishments: EstablishmentsService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Photos partagées d'un modèle (toutes boutiques)" })
  search(@Query() q: ImageQueryDto) {
    return this.images.search(q);
  }

  /** Fichier image : public (balise <img> sans jeton), mis en cache longtemps (contenu immuable) */
  @Get(':id/file')
  @ApiOperation({ summary: 'Fichier de la photo' })
  async file(@Param('id') id: string, @Res() res: Response) {
    const img = await this.images.file(id);
    res.setHeader('Content-Type', img.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${img.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(img.data));
  }

  @Post()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Ajouter une photo à la base partagée (redimensionnée par le navigateur)' })
  async upload(@UploadedFile() file: { buffer: Buffer; size: number } | undefined, @Body() dto: ImageUploadDto, @CurrentUser() user: any) {
    const est = user?.tenantId ? await this.establishments.findById(user.tenantId).catch(() => null) : null;
    return this.images.upload(file, dto, { establishmentId: user?.tenantId, establishmentName: est?.name, name: user?.name });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retirer une photo ajoutée par ma boutique' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.images.remove(id, user?.tenantId);
  }
}
