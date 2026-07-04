import { Module } from '@nestjs/common';
import { RegistersModule } from '../registers/registers.module';
import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [RegistersModule, IdempotencyModule], // registers: getCurrentRowForOperatorOrThrow; idem: ADR-0019
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
