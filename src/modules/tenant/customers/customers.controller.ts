import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Customers & Resellers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les clients / revendeurs' })
  @ApiQuery({ name: 'type', enum: ['standard', 'resellers', 'all'], required: false })
  findAll(@CurrentTenant('databaseName') db: string, @Query('type') type?: 'resellers' | 'standard' | 'all') {
    return this.customersService.findAll(db, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'un client avec ses ventes' })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.customersService.findById(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un client ou revendeur' })
  create(@CurrentTenant('databaseName') db: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(db, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un client' })
  update(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: Partial<CreateCustomerDto>) {
    return this.customersService.update(db, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un client' })
  remove(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.customersService.remove(db, id);
  }
}
