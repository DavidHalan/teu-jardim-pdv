import { Module } from '@nestjs/common';
import { RegistersModule } from '../registers/registers.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [RegistersModule], // usa getCurrentRowForOperatorOrThrow
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
