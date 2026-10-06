import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarrantyStatus } from '../../../../common/enums/warranty-status.enum';

export class CreateWarrantyDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  saleId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ example: 'Samsung Galaxy S24 Ultra' })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiPropertyOptional({ example: 'R5CW10ABCD' })
  @IsString()
  @IsOptional()
  serialNumber?: string;

  @ApiProperty({ example: 12, description: 'Durée en mois' })
  @IsNumber()
  warrantyDurationMonths: number;

  @ApiPropertyOptional({ enum: WarrantyStatus, default: WarrantyStatus.ACTIVE })
  @IsEnum(WarrantyStatus)
  @IsOptional()
  status?: WarrantyStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
