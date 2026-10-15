import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean, IsIn, MaxLength, Matches, Min, ArrayNotEmpty, ArrayMaxSize, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

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
  @Min(0, { message: 'Les prix et quantités ne peuvent pas être négatifs.' })
  purchasePrice: number;

  @ApiProperty({ example: 850000 })
  @IsNumber()
  @Min(0, { message: 'Les prix et quantités ne peuvent pas être négatifs.' })
  salePrice: number;

  @ApiPropertyOptional({ example: 780000 })
  @IsNumber()
  @Min(0, { message: 'Les prix et quantités ne peuvent pas être négatifs.' })
  @IsOptional()
  resellerPrice?: number;

  @ApiPropertyOptional({ example: 10, description: 'Ignoré pour les produits à N° de série (stock = unités scannées)' })
  @IsNumber()
  @Min(0, { message: 'Les prix et quantités ne peuvent pas être négatifs.' })
  @IsOptional()
  stockQuantity?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsNumber()
  @Min(0, { message: 'Les prix et quantités ne peuvent pas être négatifs.' })
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

/** Modification d'un produit : mêmes règles que la création, tous les champs facultatifs */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateVariantDto {
  @ApiPropertyOptional({ example: '128 Go', description: 'Capacité / configuration de la variante' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  model?: string;

  @ApiPropertyOptional({ example: 'Noir' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  color?: string;

  @ApiPropertyOptional({ description: "Prix d'achat de cette version (sinon celui du modèle)" })
  @IsNumber()
  @Min(0, { message: 'Les prix ne peuvent pas être négatifs.' })
  @IsOptional()
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Prix de vente de cette version (sinon celui du modèle)' })
  @IsNumber()
  @Min(0, { message: 'Les prix ne peuvent pas être négatifs.' })
  @IsOptional()
  salePrice?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0, { message: 'Les prix ne peuvent pas être négatifs.' })
  @IsOptional()
  resellerPrice?: number;
}

export class CreateVariantsDto {
  @ApiProperty({ type: [CreateVariantDto], description: 'Plusieurs versions du modèle, enregistrées en une fois' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Ajoutez au moins une version.' })
  @ArrayMaxSize(30, { message: '30 versions au maximum en une fois.' })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
