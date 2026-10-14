import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveSeriesDto {
  @ApiProperty({ example: 'smartphones' }) @IsString() @IsNotEmpty() @MaxLength(60) category: string;

  @ApiProperty({ example: 'TEL', description: '2 à 5 lettres' })
  @IsString()
  @Matches(/^[A-Za-z]{2,5}$/, { message: 'Le préfixe doit faire 2 à 5 lettres, sans chiffre ni accent (ex : TEL, PC).' })
  prefix: string;
}

export class GenerateCodesDto {
  @ApiProperty() @IsString() @IsNotEmpty() seriesId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Le nombre de codes doit être un nombre entier.' })
  @Min(1, { message: 'Générez au moins 1 code.' })
  @Max(500, { message: '500 codes au maximum par génération.' })
  count: number;

  @ApiPropertyOptional({ description: 'Modèle prévu (son nom est imprimé sur l\'étiquette)' })
  @IsString()
  @IsOptional()
  productId?: string;
}

export class PrintedDto {
  @ApiProperty({ enum: ['a4', 'thermal'] }) @IsIn(['a4', 'thermal']) format: string;

  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) @IsOptional() count?: number;
}
