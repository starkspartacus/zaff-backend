import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RepairsService } from './repairs.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Repairs (SAV)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Invalidates('repairs', 'dashboard')
@Controller('repairs')
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les dossiers SAV / Réparations' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@CurrentTenant('databaseName') db: string, @Query('status') status?: string) {
    return this.repairsService.findAll(db, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'une réparation' })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.repairsService.findById(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Ouvrir un nouveau dossier de réparation' })
  create(@CurrentTenant('databaseName') db: string, @Body() dto: CreateRepairDto) {
    return this.repairsService.create(db, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un dossier SAV (statut, coûts, diagnostic)' })
  update(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: Partial<CreateRepairDto>) {
    return this.repairsService.update(db, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un dossier SAV' })
  remove(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.repairsService.remove(db, id);
  }
}
