import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessSessionsService } from '../business-sessions/business-sessions.service';
import { OpenClosedStatus } from '@teu-jardim/shared';
import type { RegisterDto } from '@teu-jardim/shared';
import type { Register } from '../../generated/prisma/client';

function toDto(r: Register): RegisterDto {
  return {
    id: r.id,
    businessSessionId: r.businessSessionId,
    operatorId: r.operatorId,
    openingAmount: r.openingAmount.toFixed(2), // Decimal→string canônica, sem float (RB-047)
    status: r.status as OpenClosedStatus,
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  };
}

@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: BusinessSessionsService,
  ) {}

  /** Caixa OPEN do operador na operação corrente (ou null). Operator-scoped (PRD: 2 caixas). */
  async getCurrentForOperator(operatorId: string): Promise<RegisterDto | null> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) return null;
    const r = await this.prisma.register.findFirst({
      where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
    });
    return r ? toDto(r) : null;
  }

  /** Abre o caixa do operador (RB-009). Exige operação OPEN (RB-008). ≤1 caixa OPEN por operador (RB-009a). */
  async openRegister(openingAmount: string, operatorId: string): Promise<RegisterDto> {
    if (Number(openingAmount) < 0) {
      throw new BadRequestException('Valor inicial não pode ser negativo.');
    }
    const session = await this.sessions.getCurrentRowOrThrow(); // RB-008
    const existing = await this.prisma.register.findFirst({
      where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
    });
    if (existing) throw new ConflictException('Você já tem um caixa aberto nesta operação.');

    const r = await this.prisma.register.create({
      data: { businessSessionId: session.id, operatorId, openingAmount },
    });
    await this.audit.log('REGISTER_OPEN', {
      userId: operatorId, entityType: 'Register', entityId: r.id, metadata: { openingAmount },
    });
    return toDto(r);
  }
}
