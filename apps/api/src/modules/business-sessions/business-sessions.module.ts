import { Module } from '@nestjs/common';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessSessionsController } from './business-sessions.controller';

@Module({
  controllers: [BusinessSessionsController],
  providers: [BusinessSessionsService],
  exports: [BusinessSessionsService], // RegistersModule depende dele
})
export class BusinessSessionsModule {}
