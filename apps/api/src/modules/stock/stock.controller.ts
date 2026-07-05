import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { JwtPayload, StockBalanceResponse, StockMovementDto as StockMovementResponse } from '@teu-jardim/shared';
import { StockService } from './stock.service';
import { StockMovementDto } from './dto/stock-movement.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// RB-054: estoque é do Administrador (consulta e movimento).
@Roles(Role.ADMIN)
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  balances(): Promise<StockBalanceResponse> {
    return this.stock.balances();
  }

  @Post('movements')
  move(@Body() dto: StockMovementDto, @CurrentUser() user: JwtPayload): Promise<StockMovementResponse> {
    return this.stock.registerMovement(dto.productId, dto.type, dto.quantity, user.sub, dto.reason);
  }
}
