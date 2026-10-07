import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '+2250102030405', description: 'Numéro de téléphone ou email' })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ example: 'Admin1234!', description: 'Mot de passe' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ example: 'zaff-plateau', description: 'Slug de l\'établissement (optionnel si détection auto)' })
  @IsString()
  @IsOptional()
  tenantSlug?: string;

  @ApiPropertyOptional({ example: 'CI', description: 'Pays du numéro (connexion par téléphone sans indicatif)' })
  @IsString()
  @IsOptional()
  countryCode?: string;
}
