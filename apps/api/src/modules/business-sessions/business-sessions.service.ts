import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpenClosedStatus } from '@teu-jardim/shared';
import type { BusinessSessionDto } from '@teu-jardim/shared';
import type { BusinessSession } from '../../generated/prisma/client';

function toDto(s: BusinessSession): BusinessSessionDto {
  return {
    id: s.id,
    name: s.name,
    status: s.status as OpenClosedStatus, // cast na borda Prisma→shared
    openedById: s.openedById,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
  };
}

@Injectable()
export class BusinessSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Operação OPEN corrente (ou null). */
  async getCurrent(): Promise<BusinessSessionDto | null> {
    const s = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    return s ? toDto(s) : null;
  }

  /** Linha Prisma da operação OPEN corrente, ou 409 (RB-008 — uso interno do RegistersService). */
  async getCurrentRowOrThrow(): Promise<BusinessSession> {
    const s = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!s) throw new ConflictException('Nenhuma operação aberta. Abra a operação primeiro.');
    return s;
  }

  /** Abre a operação. Regra proposta RB-007a: ≤1 operação OPEN por vez. */
  async openSession(name: string, userId: string): Promise<BusinessSessionDto> {
    const open = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (open) throw new ConflictException('Já existe uma operação aberta.');

    const s = await this.prisma.businessSession.create({ data: { name, openedById: userId } });
    await this.audit.log('SESSION_OPEN', {
      userId, entityType: 'BusinessSession', entityId: s.id,
    });
    return toDto(s);
  }

  /** Encerra a operação (RB-007). Pré-condição RB-007b: nenhum caixa OPEN e nenhuma conta OPEN. */
  async closeSession(userId: string): Promise<BusinessSessionDto> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) throw new ConflictException('Nenhuma operação aberta.');

    const openRegisters = await this.prisma.register.count({
      where: { businessSessionId: session.id, status: 'OPEN' },
    });
    if (openRegisters > 0) {
      throw new ConflictException('Há caixa(s) aberto(s). Feche todos os caixas antes de encerrar a operação.');
    }
    const openAccounts = await this.prisma.account.count({
      where: { businessSessionId: session.id, status: 'OPEN' },
    });
    if (openAccounts > 0) {
      throw new ConflictException('Há conta(s) aberta(s). Pague ou cancele antes de encerrar a operação.');
    }

    const closed = await this.prisma.businessSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.audit.log('SESSION_CLOSE', {
      userId,
      entityType: 'BusinessSession',
      entityId: closed.id,
    });
    return toDto(closed);
  }
}
