import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

// Global: auditoria é chamada por todos os módulos sem reimportar.
@Global()
@Module({
  controllers: [AuditController], // consulta Admin (F-8, RB-044)
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
