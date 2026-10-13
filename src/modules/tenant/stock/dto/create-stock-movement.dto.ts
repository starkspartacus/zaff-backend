import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
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

  @ApiProperty({ example: 5, description: 'Entrée / sortie : quantité (≥ 1). Ajustement : nouveau stock compté (≥ 0)' })
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(0, { message: 'La quantité ne peut pas être négative.' })
  @Max(1_000_000)
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
