import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Grossiste Tech Abidjan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'M. Yao' })
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'contact@grossiste.ci' })
  @IsEmail({}, { message: "L'e-mail du fournisseur n'est pas valide." })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '0701020304' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class PurchaseOrderLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être au moins 1.' })
  @Max(10000)
  quantity: number;

  @ApiPropertyOptional({ example: 240000, description: "Prix d'achat unitaire (sinon prix d'achat du catalogue)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: "Le prix d'achat ne peut pas être négatif." })
  @IsOptional()
  unitPrice?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsString() @IsNotEmpty() supplierId: string;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Ajoutez au moins un article à la commande.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  items: PurchaseOrderLineDto[];

  @ApiPropertyOptional({ description: 'Livraison attendue le' })
  @IsDateString()
  @IsOptional()
  expectedAt?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class ReceiveLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;

  @ApiPropertyOptional({ description: 'Quantité reçue (produit sans N° de série)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'N° de série / IMEI scannés (produit suivi)' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];
}

export class ReceivePurchaseOrderDto {
  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Indiquez ce qui a été reçu.' })
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  items: ReceiveLineDto[];

  @ApiPropertyOptional({ description: 'Mettre à jour le prix d\'achat du catalogue avec celui de la commande', default: true })
  @IsOptional()
  updatePurchasePrice?: boolean;
}

export class SupplierPaymentDto {
  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Le montant doit être positif.' })
  amount: number;

  @ApiPropertyOptional({ enum: ['cash', 'mobile_money', 'bank_transfer', 'card'] })
  @IsIn(['cash', 'mobile_money', 'bank_transfer', 'card'])
  @IsOptional()
  method?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}
