import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerPaymentDto, UpdateCustomerDto } from './dto/customer-payment.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Tenant - Customers & Resellers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Invalidates('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les clients / revendeurs (debtors = clients qui doivent de l\'argent)' })
  @ApiQuery({ name: 'type', enum: ['standard', 'resellers', 'debtors', 'all'], required: false })
  findAll(@CurrentTenant('databaseName') db: string, @Query('type') type?: 'resellers' | 'standard' | 'debtors' | 'all') {
    return this.customersService.findAll(db, type);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détails d'un client : ventes, paiements, reste à payer" })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.customersService.findById(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un client ou revendeur' })
  create(@CurrentTenant() tenant: any, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenant.databaseName, dto, tenant.countryCode);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un client' })
  update(@CurrentTenant() tenant: any, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(tenant.databaseName, id, dto, tenant.countryCode);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Encaisser un paiement (vente à crédit, revendeur)' })
  addPayment(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @CurrentUser() user: any, @Body() dto: CustomerPaymentDto) {
    return this.customersService.addPayment(db, id, dto, { userId: user.userId, name: user.name, role: user.role });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Supprimer un client (propriétaire, sans dette)' })
  remove(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.customersService.remove(db, id);
  }
}
