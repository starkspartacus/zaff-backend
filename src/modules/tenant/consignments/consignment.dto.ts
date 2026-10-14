import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateConsignmentDto {
  @ApiPropertyOptional({ description: 'Revendeur déjà enregistré' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Ali Traoré', description: 'Nouveau revendeur : nom' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ example: '0701020304' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'CI0012345678', description: "Pièce d'identité (facultatif)" })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  idNumber?: string;

  @ApiProperty({ example: ['356789104523871'], description: 'N° de série / IMEI remis' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Scannez au moins un appareil.' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  serialNumbers: string[];

  @ApiPropertyOptional({ example: { '356789104523871': 500000 }, description: 'Prix convenu par N° de série (sinon tarif revendeur)' })
  @IsObject()
  @IsOptional()
  prices?: Record<string, number>;

  @ApiPropertyOptional({ example: 3, description: 'Jours avant retour prévu (3 par défaut)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  days?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  notes?: string;
}

export class SettleConsignmentDto {
  @ApiPropertyOptional({ description: 'N° de série vendus par le revendeur (il paie le prix convenu)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sold?: string[];

  @ApiPropertyOptional({ description: 'N° de série rapportés (remis en stock)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  returned?: string[];

  @ApiPropertyOptional({ enum: ['cash', 'mobile', 'card', 'bank_transfer', 'credit'], default: 'cash' })
  @IsIn(['cash', 'mobile', 'card', 'bank_transfer', 'credit'])
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'À crédit : acompte versé maintenant' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: ['cash', 'mobile'] })
  @IsIn(['cash', 'mobile'])
  @IsOptional()
  depositMethod?: string;
}
