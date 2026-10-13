import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean, IsInt, Min, Max, ArrayNotEmpty, ArrayMaxSize, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../../../common/enums/payment-method.enum';
import { SaleType } from '../../../../common/enums/sale-type.enum';

export class CreateSaleItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productSku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productCategory?: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être au moins 1.' })
  @Max(10000)
  quantity: number;

  @ApiPropertyOptional({ example: 750000, description: 'Prix unitaire (par défaut : prix du catalogue, revendeur si vente revendeur)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Ignoré : recalculé par le serveur (prix × quantité)' })
  @IsNumber()
  @IsOptional()
  total?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  warrantyEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  @IsOptional()
  warrantyMonths?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  serialNumber?: string;
}

export class CreateSaleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Le panier est vide.' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiPropertyOptional({ description: 'Ignoré : recalculé par le serveur' })
  @IsNumber()
  @IsOptional()
  subtotal?: number;

  @ApiPropertyOptional({ example: 0, description: 'Remise en montant sur le total' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'La remise ne peut pas être négative.' })
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional({ description: 'Ignoré : recalculé par le serveur (sous-total − remise)' })
  @IsNumber()
  @IsOptional()
  total?: number;

  @ApiPropertyOptional({ example: 800000, description: 'Montant remis par le client (pour rendre la monnaie)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Vente à crédit : acompte versé maintenant' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: "L'acompte ne peut pas être négatif." })
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: ['cash', 'mobile', 'card', 'bank_transfer'], default: 'cash' })
  @IsIn(['cash', 'mobile', 'card', 'bank_transfer'])
  @IsOptional()
  depositMethod?: string;

  @ApiProperty({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: SaleType, default: SaleType.PURCHASE })
  @IsEnum(SaleType)
  saleType: SaleType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'AV-1001', description: 'Avoir utilisé pour payer (tout ou partie)' })
  @IsString()
  @IsOptional()
  creditNoteCode?: string;
}

export class ReturnSaleItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être au moins 1.' })
  quantity: number;

  @ApiPropertyOptional({ description: 'Obligatoire pour un appareil suivi par N° de série' })
  @IsString()
  @IsOptional()
  serialNumber?: string;
}

export class ReturnSaleDto {
  @ApiPropertyOptional({ example: "Le revendeur n'a pas vendu le lot" })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ type: [ReturnSaleItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Choisissez au moins un article à retourner.' })
  @ValidateNested({ each: true })
  @Type(() => ReturnSaleItemDto)
  items: ReturnSaleItemDto[];

  @ApiPropertyOptional({ enum: ['cash', 'mobile'], description: "Remboursement de la part déjà payée (si elle dépasse le reste à payer)" })
  @IsIn(['cash', 'mobile', 'none'])
  @IsOptional()
  refundMethod?: 'cash' | 'mobile' | 'none';
}
