import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { StockCountsService } from './stock-counts.service';
import { CloseStockCountDto, CountProductDto, ScanStockCountDto, StartStockCountDto } from './stock-count.dto';

const actorOf = (user: any) => ({ userId: user.userId, name: user.name, role: user.role });

@ApiTags('Tenant - Inventaire par scan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STOREKEEPER, Role.SELLER)
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly service: StockCountsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Inventaire en cours (avec avancement), ou null' })
  current(@CurrentTenant('databaseName') db: string) {
    return this.service.current(db);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Inventaires terminés' })
  list(@CurrentTenant('databaseName') db: string) {
    return this.service.list(db);
  }

  @Get(':id')
  get(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.get(db, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Démarrer un inventaire (tout le stock ou une catégorie)' })
  start(@CurrentTenant('databaseName') db: string, @Body() dto: StartStockCountDto, @CurrentUser() user: any) {
    return this.service.start(db, dto.category, actorOf(user));
  }

  @Post(':id/scan')
  @ApiOperation({ summary: 'Scanner un appareil (N° de série) ou un produit (code-barres, +1)' })
  scan(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: ScanStockCountDto, @CurrentUser() user: any) {
    return this.service.scan(db, id, dto.code, actorOf(user));
  }

  @Post(':id/count')
  @ApiOperation({ summary: 'Ajouter / corriger la quantité comptée d\'un produit sans N° de série' })
  count(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: CountProductDto, @CurrentUser() user: any) {
    return this.service.count(db, id, dto.productId, dto.qty, actorOf(user));
  }

  @Post(':id/close')
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  @ApiOperation({ summary: 'Terminer : rapport et correction du stock compté' })
  close(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: CloseStockCountDto, @CurrentUser() user: any) {
    return this.service.close(db, id, dto.applyAdjustments !== false, actorOf(user));
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.STOREKEEPER)
  cancel(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.cancel(db, id);
  }
}
