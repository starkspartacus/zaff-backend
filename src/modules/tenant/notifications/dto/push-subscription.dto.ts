import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class PushSubscribeDto {
  @ApiProperty({ description: 'Endpoint fourni par le navigateur (PushSubscription.endpoint)' })
  @IsUrl({ protocols: ['https'], require_tld: true }, { message: 'Abonnement push invalide.' })
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  userAgent?: string;
}

export class PushUnsubscribeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
