import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type {
  CashMovementDto,
  CurrentRegisterResponse,
  JwtPayload,
  RegisterCloseSummary,
  RegisterClosedDto,
  RegisterDto,
  RegisterMovementsResponse,
} from '@teu-jardim/shared';
import { RegistersService } from './registers.service';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { CashSupplyDto, CashWithdrawalDto } from './dto/cash-movement.dto';
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

  // Sangria (RB-052): Caixa; valor+motivo; idempotente.
  @Roles(Role.CASHIER)
  @Post('current/withdrawals')
  withdraw(
    @Body() dto: CashWithdrawalDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<CashMovementDto> {
    return this.registers.registerWithdrawal(user.sub, dto.amount, dto.reason, idempotencyKey);
  }

  // Suprimento (RB-052): Caixa; valor+motivo; idempotente.
  @Roles(Role.CASHIER)
  @Post('current/supplies')
  supply(
    @Body() dto: CashSupplyDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<CashMovementDto> {
    return this.registers.registerSupply(user.sub, dto.amount, dto.reason, idempotencyKey);
  }

  // Movimentações do caixa corrente (conferência da gaveta) — todos os tipos, desc.
  @Roles(Role.CASHIER)
  @Get('current/movements')
  movements(@CurrentUser() user: JwtPayload): Promise<RegisterMovementsResponse> {
    return this.registers.listMovements(user.sub);
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
