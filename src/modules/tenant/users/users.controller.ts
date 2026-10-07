import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Invalidates('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Créer un collaborateur pour la boutique' })
  create(@CurrentTenant() tenant: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenant.databaseName, tenant._id, dto, tenant.countryCode);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Lister les collaborateurs de la boutique' })
  findAll(@CurrentTenant('databaseName') db: string) {
    return this.usersService.findAll(db);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Détails d\'un collaborateur' })
  findOne(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.usersService.findById(db, id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Mettre à jour un collaborateur' })
  update(@CurrentTenant() tenant: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(tenant.databaseName, tenant._id, id, dto, tenant.countryCode);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Supprimer un collaborateur' })
  remove(@CurrentTenant() tenant: any, @Param('id') id: string) {
    return this.usersService.remove(tenant.databaseName, tenant._id, id);
  }
}
