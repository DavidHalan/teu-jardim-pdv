import { Module } from '@nestjs/common';
import { PrintService } from './print.service';
import { PrintController } from './print.controller';
import { PrintAlertsController } from './print-alerts.controller';

@Module({
  // Alerts primeiro: rota literal `alerts` precisa resolver antes de `:id` (consumer).
  controllers: [PrintAlertsController, PrintController],
  providers: [PrintService],
  exports: [PrintService], // accounts enfileira na tx do lançamento (evento in-process)
})
export class PrintModule {}
