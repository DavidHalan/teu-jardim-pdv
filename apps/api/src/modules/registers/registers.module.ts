import { Module } from '@nestjs/common';
import { BusinessSessionsModule } from '../business-sessions/business-sessions.module';
import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { RegistersService } from './registers.service';
import { RegistersController } from './registers.controller';

@Module({
  imports: [BusinessSessionsModule, IdempotencyModule],
  controllers: [RegistersController],
  providers: [RegistersService],
  exports: [RegistersService],
})
export class RegistersModule {}
