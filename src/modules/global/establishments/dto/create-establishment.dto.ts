import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEstablishmentDto {
  @ApiProperty({ example: 'Zaff Boutique Plateau' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'zaff-plateau' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: '+2250700000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@zaff.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Plateau, Abidjan' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'F' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'Admin Plateau' })
  @IsString()
  @IsOptional()
  adminName?: string;

  @ApiPropertyOptional({ example: '+2250700000000' })
  @IsString()
  @IsOptional()
  adminPhone?: string;

  @ApiPropertyOptional({ example: 'Password123!' })
  @IsString()
  @IsOptional()
  adminPassword?: string;
}
