import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { BusinessSessionDto, CurrentSessionResponse, JwtPayload } from '@teu-jardim/shared';
import { BusinessSessionsService } from './business-sessions.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('business-sessions')
export class BusinessSessionsController {
  constructor(private readonly sessions: BusinessSessionsService) {}

  // Leitura: qualquer autenticado (garçom precisa saber se a operação está aberta para a S3).
  @Get('current')
  async current(): Promise<CurrentSessionResponse> {
    return { session: await this.sessions.getCurrent() };
  }

  // Abertura: só Caixa (ADMIN passa pelo RolesGuard). RB-041.
  @Roles(Role.CASHIER)
  @Post()
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: JwtPayload): Promise<BusinessSessionDto> {
    return this.sessions.openSession(dto.name, user.sub);
  }

  @Roles(Role.CASHIER)
  @Post('current/close')
  close(@CurrentUser() user: JwtPayload): Promise<BusinessSessionDto> {
    return this.sessions.closeSession(user.sub);
  }
}
