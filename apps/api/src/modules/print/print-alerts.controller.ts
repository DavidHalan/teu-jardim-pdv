import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { PrintJobDto, PrintJobListResponse, JwtPayload } from '@teu-jardim/shared';
import { PrintService } from './print.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Alertas de cupom para o OPERADOR (RB-051): EXPIRED/FAILED direcionados a quem lançou
 * (decisão dono 2026-07-04). JWT normal (qualquer perfil lança pedido — RB-040).
 * Registrado ANTES do PrintController no módulo: `alerts` resolve antes de `:id`.
 */
@Controller('print-jobs')
export class PrintAlertsController {
  constructor(private readonly print: PrintService) {}

  @Get('alerts')
  alerts(@CurrentUser() user: JwtPayload): Promise<PrintJobListResponse> {
    return this.print.listAlertsFor(user.sub);
  }

  // Ciência do alerta: o operador avisou a estação por voz (fallback RB-051).
  @Post(':id/dismiss')
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PrintJobDto> {
    return this.print.dismiss(id, user.sub);
  }
}
