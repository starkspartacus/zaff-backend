import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Inscription d'une boutique et de son propriétaire (aucune valeur par défaut : tout est vérifié) */
export class RegisterEstablishmentDto {
  // ─── Boutique ───
  @ApiProperty({ example: 'Zaff Phone Center' })
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Le nom de la boutique doit faire entre 2 et 80 caractères.' })
  name: string;

  @ApiProperty({ example: 'CI', description: 'Code pays ISO (CI, SN, CM…)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'Choisissez le pays.' })
  countryCode: string;

  @ApiProperty({ example: 'Abidjan' })
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Indiquez la ville.' })
  city: string;

  @ApiPropertyOptional({ example: 'Cocody', description: 'Obligatoire à Abidjan' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  commune?: string;

  @ApiPropertyOptional({ example: 'Riviera 2, près de la pharmacie' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string;

  @ApiPropertyOptional({ example: '27 22 00 00 00', description: 'Téléphone fixe / WhatsApp de la boutique (facultatif)' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  shopPhone?: string;

  // ─── Propriétaire ───
  @ApiProperty({ example: 'Michel Koffi' })
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Indiquez votre nom et prénom.' })
  ownerName: string;

  @ApiProperty({ example: '07 07 07 07 07', description: 'Numéro national (le pays choisi donne l’indicatif) ou +225…' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indiquez votre numéro de téléphone.' })
  @MaxLength(30)
  ownerPhone: string;

  @ApiProperty({ example: 'michel@exemple.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  ownerEmail: string;

  @ApiProperty({ example: 'Boutique2026', description: '8 caractères minimum, au moins une lettre et un chiffre' })
  @IsString()
  @Length(8, 72, { message: 'Le mot de passe doit faire au moins 8 caractères.' })
  @Matches(/^(?=.*[A-Za-zÀ-ÿ])(?=.*\d)/, { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' })
  password: string;
}

/** Vérification en direct pendant la saisie (numéro / e-mail déjà utilisés ?) */
export class RegistrationCheckDto {
  @ApiPropertyOptional({ example: 'CI' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ example: '07 07 07 07 07' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'michel@exemple.com' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;
}
