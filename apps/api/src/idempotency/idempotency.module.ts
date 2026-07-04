import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

// Infra transversal (como src/prisma): módulos financeiros importam explicitamente.
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
