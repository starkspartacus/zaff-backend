import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ContractLegalDto {
  @ApiProperty({ example: 'ZAFF STORE' }) @IsString() @MaxLength(120) legalName: string;
  @ApiProperty({ example: 'SARL' }) @IsString() @MaxLength(60) legalForm: string;
  @ApiProperty() @IsString() @MaxLength(300) activity: string;
  @ApiProperty({ example: 'CI-ABJ-03-2024-B12-00001' }) @IsString() @MaxLength(80) rccm: string;
  @ApiProperty({ example: '2400000 A' }) @IsString() @MaxLength(80) taxId: string;
  @ApiProperty({ example: 'Michel Koffi, Gérant' }) @IsString() @MaxLength(120) representative: string;
}

class ContractArticleDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) id: string;
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(8000) body: string;
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty({ enum: ['text', 'seller', 'customer', 'product', 'returns'] })
  @IsIn(['text', 'seller', 'customer', 'product', 'returns'])
  kind: 'text' | 'seller' | 'customer' | 'product' | 'returns';
}

/** Contrat de vente et garantie : modèle par défaut ou personnalisé */
export class ContractSettingsDto {
  @ApiProperty({ enum: ['default', 'custom'] }) @IsIn(['default', 'custom']) mode: 'default' | 'custom';

  @ApiProperty({ type: ContractLegalDto }) @ValidateNested() @Type(() => ContractLegalDto) legal: ContractLegalDto;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) intro?: string;

  @ApiPropertyOptional({ type: [ContractArticleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ContractArticleDto)
  articles?: ContractArticleDto[];

  @ApiProperty() @IsBoolean() warrantyCard: boolean;
}
