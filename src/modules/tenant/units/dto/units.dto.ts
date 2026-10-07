import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../../../common/enums/payment-method.enum';
import { UnitStatus } from '../../../../common/enums/unit-status.enum';

export class AddUnitsDto {
  @ApiProperty({ description: 'Modèle (produit) auquel rattacher les appareils' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: ['356789104523871', 'F2LXK9ABCD12'], description: 'N° de série / IMEI scannés' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serialNumbers: string[];

  @ApiPropertyOptional({ example: 'Arrivage du 06/10' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class SellUnitDto {
  @ApiProperty({ example: '356789104523871', description: 'N° de série / IMEI scanné' })
  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Prix négocié (par défaut : prix de vente du modèle)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Montant remis par le client' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @ApiPropertyOptional({ example: 'Michel Koffi' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ example: '+2250701020304' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'AV-1001', description: 'Avoir à déduire (échange)' })
  @IsString()
  @IsOptional()
  creditNoteCode?: string;

  @ApiPropertyOptional({ example: 12, description: 'Garantie en mois (0 = aucune). Nécessite un client.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  warrantyMonths?: number;
}

export class UpdateUnitStatusDto {
  @ApiProperty({ enum: [UnitStatus.IN_STOCK, UnitStatus.DEFECTIVE] })
  @IsIn([UnitStatus.IN_STOCK, UnitStatus.DEFECTIVE], { message: 'Statut possible : in_stock ou defective.' })
  status: UnitStatus.IN_STOCK | UnitStatus.DEFECTIVE;

  @ApiPropertyOptional({ example: 'Écran rayé à la réception' })
  @IsString()
  @IsOptional()
  notes?: string;
}
