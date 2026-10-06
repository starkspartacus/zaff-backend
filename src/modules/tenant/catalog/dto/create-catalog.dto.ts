import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Smartphones' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'smartphone' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'smartphone' })
  @IsString()
  @IsOptional()
  icon?: string;
}

export class CreateBrandDto {
  @ApiProperty({ example: 'Apple' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro Max 256GB' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'IPH15PM-256' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 'smartphone' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiProperty({ example: 650000 })
  @IsNumber()
  purchasePrice: number;

  @ApiProperty({ example: 850000 })
  @IsNumber()
  salePrice: number;

  @ApiPropertyOptional({ example: 780000 })
  @IsNumber()
  @IsOptional()
  resellerPrice?: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  stockQuantity: number;

  @ApiPropertyOptional({ example: 3 })
  @IsNumber()
  @IsOptional()
  minStockAlert?: number;

  @ApiPropertyOptional({ example: 'Écran Super Retina XDR, Titane naturel' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  specifications?: Record<string, any>;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  types?: Array<{ name: string; skuSuffix?: string; specifications?: Record<string, string> }>;
}

export class SetupHierarchyDto {
  @ApiProperty()
  @IsString()
  categoryName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categorySlug?: string;

  @ApiProperty({ example: ['Apple', 'Samsung'] })
  @IsArray()
  brands: string[];
}
