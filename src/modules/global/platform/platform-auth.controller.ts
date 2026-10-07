import { Body, Controller, Get, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAdminGuard } from './platform.guard';

class PlatformLoginDto {
  @IsString() @MaxLength(200) email: string;
  @IsString() @MaxLength(200) password: string;
}

@ApiTags('Plateforme - Administrateur ZAFF')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: "Connexion de l'administrateur de la plateforme (identifiants dans l'environnement)" })
  login(@Body() dto: PlatformLoginDto, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, ip);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  me(@CurrentUser() user: any) {
    return { email: user.email, name: user.name };
  }
}
