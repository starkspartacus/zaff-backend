import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { COUNTRIES, citiesOf, findCountry } from '../../../common/geo/geo';

/** Données géographiques (publiques, statiques, mises en cache par le navigateur) pour l'inscription et la connexion */
@ApiTags('Global - Geo (pays, villes, devises)')
@Controller('global/geo')
export class GeoController {
  @Get('countries')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'Tous les pays : indicatif, drapeau, devise (Afrique en premier)' })
  countries() {
    return COUNTRIES;
  }

  @Get('countries/:code/cities')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: "Villes d'un pays et leurs communes (vide : ville en saisie libre)" })
  cities(@Param('code') code: string) {
    const country = findCountry(code);
    if (!country) throw new NotFoundException(`Pays « ${code} » inconnu.`);
    return citiesOf(country.code);
  }
}
