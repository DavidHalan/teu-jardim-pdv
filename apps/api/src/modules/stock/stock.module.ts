import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

// Estoque desacoplado da venda (RB-046): nenhum módulo depende dele.
@Module({
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
