import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global: auditoria é chamada por todos os módulos sem reimportar.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
