import { Module } from '@nestjs/common';
import { PrintService } from './print.service';
import { PrintController } from './print.controller';

@Module({
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService], // accounts enfileira na tx do lançamento (evento in-process)
})
export class PrintModule {}
