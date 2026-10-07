import { Controller, Get, Post, Put, Body, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';

/** Réservé à l'administrateur de la plateforme : jamais accessible à une boutique */
const PlatformAdmin = () => (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
  UseGuards(JwtAuthGuard, RolesGuard)(target, key, descriptor);
  Roles(Role.SUPERADMIN)(target, key, descriptor);
  ApiBearerAuth()(target, key, descriptor);
};
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
  @PlatformAdmin()
  @ApiOperation({ summary: 'Lister tous les établissements de la plateforme' })
  findAll() {
    return this.establishmentsService.findAll();
  }

  @Get(':id')
  @PlatformAdmin()
  @ApiOperation({ summary: 'Détails d\'un établissement' })
  findOne(@Param('id') id: string) {
    return this.establishmentsService.findById(id);
  }

  @Put(':id')
  @PlatformAdmin()
  @ApiOperation({ summary: 'Mettre à jour un établissement' })
  update(@Param('id') id: string, @Body() dto: UpdateEstablishmentDto) {
    return this.establishmentsService.update(id, dto);
  }

  @Patch(':id/toggle-status')
  @PlatformAdmin()
  @ApiOperation({ summary: 'Activer / Suspendre un établissement' })
  toggleStatus(@Param('id') id: string) {
    return this.establishmentsService.toggleStatus(id);
  }
}
