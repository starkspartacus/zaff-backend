import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType, StockReferenceType } from '../../../../common/enums/stock-movement.enum';

export class CreateStockMovementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ enum: StockMovementType })
  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @ApiProperty({ example: 5 })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ enum: StockReferenceType, default: StockReferenceType.MANUAL })
  @IsEnum(StockReferenceType)
  @IsOptional()
  referenceType?: StockReferenceType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
