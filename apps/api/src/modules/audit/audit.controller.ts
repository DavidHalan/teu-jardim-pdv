import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import type { AuditQueryResponse } from '@teu-jardim/shared';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // RB-044: só Admin lê a trilha; via API nunca cria/edita/deleta (REVOKE no banco é o backstop).
  @Roles(Role.ADMIN)
  @Get()
  query(@Query() dto: AuditQueryDto): Promise<AuditQueryResponse> {
    return this.audit.query(dto);
  }
}
