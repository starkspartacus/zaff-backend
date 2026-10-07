import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReturnDto {
  @ApiProperty({ example: '356789104523871' })
  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @ApiProperty({ enum: ['change_of_mind', 'defective'] })
  @IsIn(['change_of_mind', 'defective'], { message: 'Motif invalide.' })
  reason: 'change_of_mind' | 'defective';

  @ApiProperty({ enum: ['credit_note', 'refund', 'exchange', 'warranty_repair', 'paid_repair'] })
  @IsIn(['credit_note', 'refund', 'exchange', 'warranty_repair', 'paid_repair'], { message: 'Solution invalide.' })
  action: 'credit_note' | 'refund' | 'exchange' | 'warranty_repair' | 'paid_repair';

  @ApiPropertyOptional({ enum: ['cash', 'mobile'] })
  @IsIn(['cash', 'mobile'])
  @IsOptional()
  refundMethod?: 'cash' | 'mobile';

  @ApiPropertyOptional({ description: 'Conditions de retour confirmées par le vendeur (changement d\'avis)' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsOptional()
  conditionsChecked?: string[];

  @ApiPropertyOptional({ example: 'Écran noir au démarrage' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  issueDescription?: string;

  @ApiPropertyOptional({ example: 'Michel Koffi' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ example: '+2250701020304' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
