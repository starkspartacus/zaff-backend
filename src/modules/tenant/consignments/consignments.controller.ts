import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ConsignmentsService } from './consignments.service';
import { CreateConsignmentDto, SettleConsignmentDto } from './consignment.dto';

@ApiTags('Tenant - Revendeurs (dépôt)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Controller('consignments')
export class ConsignmentsController {
  constructor(private readonly service: ConsignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Bons de remise (status=open|closed|all, customerId)' })
  list(@CurrentTenant('databaseName') db: string, @Query('status') status?: string, @Query('customerId') customerId?: string) {
    return this.service.list(db, { status: status || 'open', customerId });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Appareils chez les revendeurs : nombre, valeur, en retard' })
  summary(@CurrentTenant('databaseName') db: string) {
    return this.service.summary(db);
  }

  @Get('by-serial/:serial')
  @ApiOperation({ summary: 'Bon ouvert contenant cet appareil' })
  bySerial(@CurrentTenant('databaseName') db: string, @Param('serial') serial: string) {
    return this.service.findBySerial(db, serial);
  }

  @Get(':id')
  get(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.get(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Remettre des appareils à un revendeur' })
  create(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Body() dto: CreateConsignmentDto) {
    return this.service.create(tenant.databaseName, dto, { userId: user.userId, name: user.name, role: user.role }, tenant.countryCode);
  }

  @Post(':id/settle')
  @ApiOperation({ summary: 'Retour du revendeur : appareils vendus (il paie) et / ou rendus (remis en stock)' })
  settle(@CurrentTenant() tenant: any, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: SettleConsignmentDto) {
    return this.service.settle(tenant.databaseName, id, dto, { userId: user.userId, name: user.name, role: user.role }, tenant.countryCode);
  }
}
