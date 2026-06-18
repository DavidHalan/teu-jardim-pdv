import { Module } from '@nestjs/common';
import { BusinessSessionsModule } from '../business-sessions/business-sessions.module';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [BusinessSessionsModule], // usa getCurrentRowOrThrow (RB-008)
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
