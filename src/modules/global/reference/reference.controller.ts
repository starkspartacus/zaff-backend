import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ReferenceService } from './reference.service';

@ApiTags('Global - Reference catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('global/reference')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catégories et marques de référence communes à toutes les boutiques' })
  getCatalog() {
    return this.referenceService.getCatalog();
  }
}
