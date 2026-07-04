import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { LoginResponse, JwtPayload } from '@teu-jardim/shared';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    // Origem p/ auditoria/lockout (RB-059/060a). LAN direta, sem proxy → req.ip é o cliente.
    return this.auth.login(dto, req.ip ?? 'unknown');
  }

  // Rota protegida (prova o guard global). Devolve o usuário do token.
  @Get('me')
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
