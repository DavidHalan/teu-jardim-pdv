import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { PaymentDto, PaymentListResponse, JwtPayload } from '@teu-jardim/shared';
import { PaymentsService } from './payments.service';
import { PayDto } from './dto/pay.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdempotencyKeyHeader } from '../../idempotency/idempotency-key.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Receber pagamento é do caixa (RB-041). Idempotency-Key obrigatório (ADR-0026 §14).
  @Roles(Role.CASHIER)
  @Post()
  pay(
    @Body() dto: PayDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<PaymentDto> {
    return this.payments.pay(dto.accountIds, dto.tenders, user.sub, idempotencyKey);
  }

  // Pagamentos da operação corrente (base do estorno) — Caixa.
  @Roles(Role.CASHIER)
  @Get()
  list(): Promise<PaymentListResponse> {
    return this.payments.listForCurrentSession();
  }

  @Roles(Role.CASHIER)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto> {
    return this.payments.getById(id);
  }

  // Estorno (RB-048/049/050): Caixa, operação OPEN, motivo obrigatório, idem-key.
  @Roles(Role.CASHIER)
  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<PaymentDto> {
    return this.payments.reverse(id, dto.reason, user.sub, idempotencyKey);
  }
}
