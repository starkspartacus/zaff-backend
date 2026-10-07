import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';

/** Page ouverte par le QR code de la fiche de garantie : publique, sans connexion */
@ApiTags('Public - Vérification de garantie')
@Controller('public/warranty')
export class PublicWarrantyController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(':code')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Vérifier une garantie à partir du QR code (état, appareil, boutique)" })
  verify(@Param('code') code: string) {
    return this.contracts.verify(code);
  }
}
