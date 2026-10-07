import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ActionTogglesDto {
  @ApiProperty() @IsBoolean() creditNote: boolean;
  @ApiProperty() @IsBoolean() refund: boolean;
  @ApiProperty() @IsBoolean() exchange: boolean;
}

class DefectivePolicyDto {
  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  @Max(90)
  exchangeWindowDays: number;

  @ApiProperty({ type: ActionTogglesDto })
  @ValidateNested()
  @Type(() => ActionTogglesDto)
  earlyActions: ActionTogglesDto;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(0)
  @Max(60)
  defaultWarrantyMonths: number;

  @ApiProperty() @IsBoolean() warrantyRepair: boolean;
  @ApiProperty() @IsBoolean() paidRepairOutOfWarranty: boolean;
}

export class ReturnPolicyDto {
  @ApiProperty() @IsBoolean() returnsEnabled: boolean;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  @Max(90)
  returnWindowDays: number;

  @ApiProperty({ example: ["Emballage d'origine complet"] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  conditions: string[];

  @ApiProperty({ type: ActionTogglesDto })
  @ValidateNested()
  @Type(() => ActionTogglesDto)
  changeOfMind: ActionTogglesDto;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(50)
  restockingFeePercent: number;

  @ApiProperty({ example: ['cash', 'mobile'] })
  @IsArray()
  @IsIn(['cash', 'mobile'], { each: true })
  refundMethods: Array<'cash' | 'mobile'>;

  @ApiProperty({ example: 90 })
  @IsInt()
  @Min(7)
  @Max(730)
  creditNoteValidityDays: number;

  @ApiProperty({ type: DefectivePolicyDto })
  @ValidateNested()
  @Type(() => DefectivePolicyDto)
  defective: DefectivePolicyDto;
}
