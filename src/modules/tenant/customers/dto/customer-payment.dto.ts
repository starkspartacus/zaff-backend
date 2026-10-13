import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

export class CustomerPaymentDto {
  @ApiProperty({ example: 150000, description: 'Montant reçu du client (revendeur)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Indiquez le montant reçu.' })
  amount: number;

  @ApiPropertyOptional({ enum: ['cash', 'mobile', 'card', 'bank_transfer'], default: 'cash' })
  @IsIn(['cash', 'mobile', 'card', 'bank_transfer'])
  @IsOptional()
  method?: string;

  @ApiPropertyOptional({ example: 'Versement du samedi' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  notes?: string;
}

/** Modification d'un client : mêmes champs que la création, tous facultatifs (jamais le solde) */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
