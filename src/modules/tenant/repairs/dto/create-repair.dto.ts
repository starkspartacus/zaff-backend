import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RepairStatus } from '../../../../common/enums/repair-status.enum';

export class CreateRepairDto {
  @ApiPropertyOptional({ description: 'Client existant (sinon customerName / customerPhone)' })
  @IsString()
  @IsOptional()
  customerId?: string;

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
  @IsOptional()
  productId?: string;

  @ApiProperty({ example: 'iPhone 13 Pro 128Go Bleu' })
  @IsString()
  @IsNotEmpty()
  deviceName: string;

  @ApiPropertyOptional({ example: 'DX3J79KL...' })
  @IsString()
  @IsOptional()
  serialNumber?: string;

  @ApiProperty({ example: 'Écran cassé et tactile inopérant' })
  @IsString()
  @IsNotEmpty()
  issueDescription: string;

  @ApiPropertyOptional({ enum: RepairStatus, default: RepairStatus.RECEIVED })
  @IsEnum(RepairStatus)
  @IsOptional()
  status?: RepairStatus;

  @ApiPropertyOptional({ example: 45000 })
  @IsNumber()
  @IsOptional()
  estimatedCost?: number;

  @ApiPropertyOptional({ example: 15000 })
  @IsNumber()
  @IsOptional()
  laborCost?: number;

  @ApiPropertyOptional({ example: 30000 })
  @IsNumber()
  @IsOptional()
  partsCost?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  repairNotes?: string;
}
