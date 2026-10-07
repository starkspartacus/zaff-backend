import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean, IsIn, MaxLength, Matches } from 'class-validator';
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

  @ApiPropertyOptional({ example: '0194253401230', description: 'Code-barres EAN/UPC du modèle' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ default: false, description: 'Chaque unité a un N° de série / IMEI' })
  @IsBoolean()
  @IsOptional()
  hasSerialNumbers?: boolean;

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

  @ApiPropertyOptional({ example: '15 Pro Max 256 Go' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ example: 'Titane naturel' })
  @IsString()
  @IsOptional()
  color?: string;

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

  @ApiPropertyOptional({ example: 10, description: 'Ignoré pour les produits à N° de série (stock = unités scannées)' })
  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsNumber()
  @IsOptional()
  minStockAlert?: number;

  @ApiPropertyOptional({ example: 'Écran Super Retina XDR, Titane naturel' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ['new', 'refurbished', 'used'], default: 'new', description: 'État à la vente (contrat)' })
  @IsIn(['new', 'refurbished', 'used'])
  @IsOptional()
  condition?: 'new' | 'refurbished' | 'used';

  @ApiPropertyOptional({ description: 'Appareil du catalogue global (id)' })
  @IsOptional()
  @Matches(/^[a-f0-9]{24}$/, { message: 'Appareil invalide.' })
  deviceId?: string | null;

  @ApiPropertyOptional({ description: "Photo de la base d'images partagée (id), null pour la retirer" })
  @IsOptional()
  @Matches(/^[a-f0-9]{24}$/, { message: 'Photo invalide.' })
  imageId?: string | null;

  @ApiPropertyOptional({ example: 'Chargeur, câble USB-C, boîte' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  accessories?: string;

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
