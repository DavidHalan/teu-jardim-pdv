import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { RegisterDto, CurrentRegisterResponse, JwtPayload, RegisterCloseSummary, RegisterClosedDto } from '@teu-jardim/shared';
import { RegistersService } from './registers.service';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdempotencyKeyHeader } from '../../idempotency/idempotency-key.decorator';

@Controller('registers')
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  @Get('current')
  async current(@CurrentUser() user: JwtPayload): Promise<CurrentRegisterResponse> {
    return { register: await this.registers.getCurrentForOperator(user.sub) };
  }

  @Roles(Role.CASHIER)
  @Post()
  open(@Body() dto: OpenRegisterDto, @CurrentUser() user: JwtPayload): Promise<RegisterDto> {
    return this.registers.openRegister(dto.openingAmount, user.sub);
  }

  @Roles(Role.CASHIER)
  @Get('current/closing-summary')
  closingSummary(@CurrentUser() user: JwtPayload): Promise<RegisterCloseSummary> {
    return this.registers.getCloseSummary(user.sub);
  }

  // Fechamento é crítico e idempotente: retry devolve o fechamento original (ADR-0026 §14).
  @Roles(Role.CASHIER)
  @Post('current/close')
  close(
    @Body() dto: CloseRegisterDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<RegisterClosedDto> {
    return this.registers.closeRegister(user.sub, dto.countedAmount, idempotencyKey);
  }
}
