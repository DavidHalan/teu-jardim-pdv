import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type {
  AccountDto,
  AccountListResponse,
  JwtPayload,
} from '@teu-jardim/shared';
import { AccountsService } from './accounts.service';
import { OpenAccountDto } from './dto/open-account.dto';
import { PlaceItemsDto } from './dto/place-items.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { CancelAccountDto } from './dto/cancel-account.dto';
import { CancelItemDto } from './dto/cancel-item.dto';
import { TransferItemDto } from './dto/transfer-item.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdempotencyKeyHeader } from '../../idempotency/idempotency-key.decorator';

// Sem @Roles: qualquer autenticado (garçom lança pedidos — RB-040). RolesGuard global libera.
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  open(@Body() dto: OpenAccountDto, @CurrentUser() user: JwtPayload): Promise<AccountDto> {
    return this.accounts.openAccount(dto.tabType, dto.number, user.sub);
  }

  @Get()
  list(): Promise<AccountListResponse> {
    return this.accounts.listOpen();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AccountDto> {
    return this.accounts.getById(id);
  }

  // Idempotency-Key obrigatório: retry de rede não duplica o lote (ADR-0026 §14).
  @Post(':id/items')
  place(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceItemsDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKeyHeader() idempotencyKey: string,
  ): Promise<AccountDto> {
    return this.accounts.placeItems(id, dto.items, user.sub, idempotencyKey);
  }

  @Roles(Role.CASHIER)
  @Post(':id/discount')
  discount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountDto> {
    return this.accounts.applyDiscount(id, dto.type, dto.value, user.sub, dto.reason);
  }

  // Cancelar item (RB-029/031): Caixa, motivo obrigatório. Editar item não existe (RB-056).
  @Roles(Role.CASHIER)
  @Post(':id/items/:itemId/cancel')
  cancelItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CancelItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountDto> {
    return this.accounts.cancelItem(id, itemId, dto.reason, user.sub);
  }

  // Transferir item (RB-032/033/034): Caixa; destino OPEN da mesma operação; não reimprime.
  @Roles(Role.CASHIER)
  @Post(':id/items/:itemId/transfer')
  transferItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: TransferItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountDto> {
    return this.accounts.transferItem(id, itemId, dto.toAccountId, user.sub);
  }

  @Roles(Role.CASHIER)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAccountDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountDto> {
    return this.accounts.cancelAccount(id, dto.reason, user.sub);
  }
}
