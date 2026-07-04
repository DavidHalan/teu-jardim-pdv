import { Module } from '@nestjs/common';
import { BusinessSessionsModule } from '../business-sessions/business-sessions.module';
import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [BusinessSessionsModule, IdempotencyModule], // sessions: RB-008; idem: ADR-0019
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
