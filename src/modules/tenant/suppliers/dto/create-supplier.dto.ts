import { IsString, IsNotEmpty, IsOptional, IsEmail, IsArray, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../../../common/enums/purchase-order-status.enum';

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
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+22501020304' })
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

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @ApiPropertyOptional({ enum: PurchaseOrderStatus, default: PurchaseOrderStatus.PENDING })
  @IsEnum(PurchaseOrderStatus)
  @IsOptional()
  status?: PurchaseOrderStatus;

  @ApiProperty({ example: 1200000 })
  @IsNumber()
  totalAmount: number;

  @ApiProperty({ example: [{ productId: '64e...', quantity: 5, unitPrice: 240000, total: 1200000 }] })
  @IsArray()
  items: Array<{ productId: string; quantity: number; unitPrice: number; total: number }>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
