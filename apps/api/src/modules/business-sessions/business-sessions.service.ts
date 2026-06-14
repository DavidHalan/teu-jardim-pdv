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
}
