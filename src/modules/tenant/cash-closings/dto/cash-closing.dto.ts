import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CloseRegisterDto {
  @ApiProperty({ example: 1250000, description: 'Espèces comptées dans la caisse par le vendeur' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Indiquez le montant en espèces compté.' })
  @Min(0, { message: 'Le montant compté ne peut pas être négatif.' })
  declaredCash: number;

  @ApiPropertyOptional({ example: 'Billet de 10 000 abîmé mis à part' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

export class ValidateClosingDto {
  @ApiPropertyOptional({ example: 'Reçu, écart de 500 F expliqué' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
