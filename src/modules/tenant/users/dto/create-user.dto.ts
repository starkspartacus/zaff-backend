import { IsString, IsNotEmpty, IsEnum, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../../common/enums/role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+2250700000001' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'jean@zaff.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Secur3Pass!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ enum: Role, default: Role.STANDARD })
  @IsEnum(Role)
  role: Role;
}
