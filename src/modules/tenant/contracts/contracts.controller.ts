import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ContractsService } from './contracts.service';
import { ContractSettingsDto } from './dto/contract-settings.dto';
import { DEFAULT_CONTRACT, PLACEHOLDERS } from './contract-template';

@ApiTags('Tenant - Contrat de vente et garantie')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller()
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('settings/sales-contract')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Contrat de vente et garantie de la boutique (+ modèle par défaut pour réinitialiser)' })
  get(@CurrentTenant() tenant: any) {
    return { contract: this.contracts.getSettings(tenant), defaults: DEFAULT_CONTRACT, placeholders: PLACEHOLDERS };
  }

  @Put('settings/sales-contract')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Personnaliser le contrat (nouvelle version, les ventes passées gardent la leur)' })
  save(@CurrentTenant() tenant: any, @Body() dto: ContractSettingsDto) {
    return this.contracts.saveSettings(tenant, dto);
  }

  @Post('settings/sales-contract/preview')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Aperçu du contrat (brouillon) avec une vente fictive' })
  preview(@CurrentTenant() tenant: any, @Body() dto: ContractSettingsDto) {
    return this.contracts.preview(tenant, dto);
  }

  @Get('sales/:id/contract')
  @Roles(Role.ADMIN, Role.SELLER)
  @ApiOperation({ summary: 'Contrat de vente et garantie à remettre au client pour cette vente' })
  forSale(@CurrentTenant() tenant: any, @Param('id') id: string) {
    return this.contracts.forSale(tenant, id);
  }
}
