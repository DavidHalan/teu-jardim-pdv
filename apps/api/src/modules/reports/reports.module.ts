import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

// Read model (RB-053): só consulta — nenhum módulo depende dele (Fase 11: reports não é dependido).
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
