import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { PaymentDto, JwtPayload } from '@teu-jardim/shared';
import { PaymentsService } from './payments.service';
import { PayDto } from './dto/pay.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Receber pagamento é do caixa (RB-041).
  @Roles(Role.CASHIER)
  @Post()
  pay(@Body() dto: PayDto, @CurrentUser() user: JwtPayload): Promise<PaymentDto> {
    return this.payments.pay(dto.accountIds, dto.tenders, user.sub);
  }
}
