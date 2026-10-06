import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean } from 'class-validator';
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
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 750000 })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ example: 750000 })
  @IsNumber()
  total: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  warrantyEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
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
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiProperty({ example: 750000 })
  @IsNumber()
  subtotal: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  discount?: number;

  @ApiProperty({ example: 750000 })
  @IsNumber()
  total: number;

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
}

export class ReturnSaleDto {
  @ApiProperty({ example: 'Client n\'a pas vendu le lot' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ example: [{ productId: '64e...', quantity: 1 }] })
  @IsArray()
  items: Array<{ productId: string; quantity: number }>;
}
