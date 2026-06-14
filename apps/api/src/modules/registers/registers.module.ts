import { Module } from '@nestjs/common';
import { BusinessSessionsModule } from '../business-sessions/business-sessions.module';
import { RegistersService } from './registers.service';
import { RegistersController } from './registers.controller';

@Module({
  imports: [BusinessSessionsModule],
  controllers: [RegistersController],
  providers: [RegistersService],
  exports: [RegistersService],
})
export class RegistersModule {}
