import { Controller, Get, Post, Put, Body, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EstablishmentsService } from './establishments.service';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@ApiTags('Global - Establishments (Tenants)')
@Controller('global/establishments')
export class EstablishmentsController {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouvel établissement (Provisionne automatiquement sa base de données dédiée)' })
  create(@Body() dto: CreateEstablishmentDto) {
    return this.establishmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les établissements de la plateforme' })
  findAll() {
    return this.establishmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'un établissement' })
  findOne(@Param('id') id: string) {
    return this.establishmentsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un établissement' })
  update(@Param('id') id: string, @Body() dto: UpdateEstablishmentDto) {
    return this.establishmentsService.update(id, dto);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activer / Suspendre un établissement' })
  toggleStatus(@Param('id') id: string) {
    return this.establishmentsService.toggleStatus(id);
  }
}
