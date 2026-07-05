import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { JwtPayload } from '@teu-jardim/shared';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // RB-053a: Funcionário não acessa (guard); Caixa só 'closing' (service); Admin tudo.
  @Roles(Role.CASHIER)
  @Get(':kind')
  get(
    @Param('kind') kind: string,
    @CurrentUser() user: JwtPayload,
    @Query('businessSessionId') businessSessionId?: string,
  ): Promise<unknown> {
    return this.reports.get(kind, user.role, businessSessionId);
  }
}
