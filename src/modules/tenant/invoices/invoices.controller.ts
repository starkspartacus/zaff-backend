import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant - Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les factures avec filtre de période' })
  @ApiQuery({ name: 'range', required: false, enum: ['today', 'week', 'month', 'year', 'custom'] })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  getInvoices(
    @CurrentTenant('databaseName') db: string,
    @Query('range') range?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.invoicesService.getInvoices(db, range, start, end);
  }

  @Get(':invoiceNumber')
  @ApiOperation({ summary: 'Récupérer le détail complet d\'une facture pour impression' })
  getInvoiceData(@CurrentTenant('databaseName') db: string, @Param('invoiceNumber') num: number) {
    return this.invoicesService.getInvoiceData(db, Number(num));
  }
}
