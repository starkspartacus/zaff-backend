import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceptionGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;

  @ApiProperty({ example: ['356789104523871'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serialNumbers: string[];
}

export class CreateReceptionDto {
  @ApiProperty({ type: [ReceptionGroupDto], description: 'Appareils scannés, regroupés par modèle (capacité / couleur)' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Aucun appareil à mettre en stock.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceptionGroupDto)
  items: ReceptionGroupDto[];

  @ApiPropertyOptional({ example: 'Livraison grossiste Adjamé' }) @IsString() @IsOptional() @MaxLength(200) note?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(80) supplierName?: string;
}
