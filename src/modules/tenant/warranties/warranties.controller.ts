import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Warranties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les garanties actives ou expirées' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@CurrentTenant('databaseName') db: string, @Query('status') status?: string) {
    return this.warrantiesService.findAll(db, status);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer une garantie manuelle' })
  create(@CurrentTenant('databaseName') db: string, @Body() dto: CreateWarrantyDto) {
    return this.warrantiesService.create(db, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour le statut d\'une garantie' })
  update(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: Partial<CreateWarrantyDto>) {
    return this.warrantiesService.update(db, id, dto);
  }
}
