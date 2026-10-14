import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartStockCountDto {
  @ApiPropertyOptional({ description: 'Catégorie à inventorier (vide = tout le stock)' })
  @IsString()
  @IsOptional()
  category?: string;
}

export class ScanStockCountDto {
  @ApiProperty({ description: 'N° de série / IMEI, ou code-barres d\'un produit sans N° de série' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class CountProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;

  @ApiProperty({ description: 'Ajout (+) ou correction (−) de la quantité comptée' })
  @Type(() => Number)
  @IsInt()
  @Min(-10000)
  @Max(10000)
  qty: number;
}

export class CloseStockCountDto {
  @ApiPropertyOptional({ description: 'Corriger le stock des produits sans N° de série selon le comptage', default: true })
  @IsBoolean()
  @IsOptional()
  applyAdjustments?: boolean;
}
