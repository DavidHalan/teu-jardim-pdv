import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { PrintJobStatus } from '@teu-jardim/shared';
import type { PrintJobDto, PrintJobListResponse } from '@teu-jardim/shared';
import { PrintService } from './print.service';
import { AckPrintJobDto } from './dto/ack-print-job.dto';
import { PrintServiceKeyGuard } from './print-service-key.guard';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Rotas do consumer (ADR-0020): fora do JWT (@Public) e atrás da chave do
 * print-service. Consulta por operador (Caixa/Admin) entra na F-6 full.
 */
@Public()
@UseGuards(PrintServiceKeyGuard)
@Controller('print-jobs')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get()
  list(
    @Query('status', new ParseEnumPipe(PrintJobStatus)) status: PrintJobStatus,
  ): Promise<PrintJobListResponse> {
    return this.print.listByStatus(status);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PrintJobDto> {
    return this.print.getById(id);
  }

  @Post(':id/ack')
  ack(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AckPrintJobDto): Promise<PrintJobDto> {
    return this.print.ack(id, dto);
  }
}
