import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  AccountDto,
  AccountListResponse,
  JwtPayload,
} from '@teu-jardim/shared';
import { AccountsService } from './accounts.service';
import { OpenAccountDto } from './dto/open-account.dto';
import { PlaceItemsDto } from './dto/place-items.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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

  @Post(':id/items')
  place(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceItemsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountDto> {
    return this.accounts.placeItems(id, dto.items, user.sub);
  }
}
