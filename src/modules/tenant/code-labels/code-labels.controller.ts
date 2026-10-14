import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Invalidates } from '../../realtime/invalidates.decorator';
import { CodeLabelsService } from './code-labels.service';
import { GenerateCodesDto, PrintedDto, SaveSeriesDto } from './code-label.dto';

const actorOf = (user: any) => ({ userId: user.userId, name: user.name, role: user.role });

@ApiTags('Tenant - Codes appareils (QR / code-barres)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STOREKEEPER)
@Controller('code-labels')
export class CodeLabelsController {
  constructor(private readonly service: CodeLabelsService) {}

  @Get('series')
  @ApiOperation({ summary: 'Séries par catégorie (préfixe, codes générés / utilisés) + catégories sans série' })
  listSeries(@CurrentTenant('databaseName') db: string) {
    return this.service.listSeries(db);
  }

  @Post('series')
  @Roles(Role.ADMIN)
  @Invalidates('code-labels')
  createSeries(@CurrentTenant('databaseName') db: string, @Body() dto: SaveSeriesDto, @CurrentUser() user: any) {
    return this.service.createSeries(db, dto.category, dto.prefix, actorOf(user));
  }

  @Put('series/:id')
  @Roles(Role.ADMIN)
  @Invalidates('code-labels')
  updateSeries(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: SaveSeriesDto) {
    return this.service.updateSeries(db, id, dto.category, dto.prefix);
  }

  @Delete('series/:id')
  @Roles(Role.ADMIN)
  @Invalidates('code-labels')
  deleteSeries(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.deleteSeries(db, id);
  }

  @Get('batches')
  @ApiOperation({ summary: 'Historique des générations (qui, quand, combien, utilisés, impressions)' })
  listBatches(@CurrentTenant('databaseName') db: string) {
    return this.service.listBatches(db);
  }

  @Get('batches/:id')
  getBatch(@CurrentTenant('databaseName') db: string, @Param('id') id: string) {
    return this.service.getBatch(db, id);
  }

  @Post('batches')
  @ApiOperation({ summary: 'Générer des codes uniques (préfixe de la catégorie + numéro + chiffre de contrôle)' })
  generate(@CurrentTenant('databaseName') db: string, @Body() dto: GenerateCodesDto, @CurrentUser() user: any) {
    return this.service.generate(db, dto.seriesId, dto.count, dto.productId, actorOf(user));
  }

  @Post('batches/:id/printed')
  @ApiOperation({ summary: 'Tracer une impression du lot' })
  printed(@CurrentTenant('databaseName') db: string, @Param('id') id: string, @Body() dto: PrintedDto, @CurrentUser() user: any) {
    return this.service.markPrinted(db, id, dto.format, dto.count, actorOf(user));
  }
}
