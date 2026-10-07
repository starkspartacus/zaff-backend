import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { EstablishmentsService } from '../../global/establishments/establishments.service';
import { resolveReturnPolicy } from './return-policy';
import { ReturnPolicyDto } from './dto/return-policy.dto';

@ApiTags('Tenant - Settings (paramètres de la boutique)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  @Get('return-policy')
  @ApiOperation({ summary: 'Politique de retour et de garantie de la boutique' })
  getReturnPolicy(@CurrentTenant() tenant: any) {
    return resolveReturnPolicy(tenant.settings);
  }

  @Put('return-policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Modifier la politique de retour (propriétaire)' })
  async updateReturnPolicy(@CurrentTenant() tenant: any, @Body() dto: ReturnPolicyDto) {
    const policy = { ...dto, conditions: dto.conditions.map((c) => c.trim()).filter(Boolean) };
    const updated = await this.establishmentsService.updateSettings(String(tenant._id), 'returnPolicy', policy);
    return resolveReturnPolicy(updated.settings);
  }
}
