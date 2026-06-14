import { describe, it, expect, vi } from 'vitest';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('persists an audit record with the given event and metadata (RB-043)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'a1' });
    const prisma = { auditLog: { create } } as any;
    const service = new AuditService(prisma);

    await service.log('AUTH_LOGIN', {
      userId: 'u1',
      entityType: 'User',
      entityId: 'u1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        eventType: 'AUTH_LOGIN',
        userId: 'u1',
        entityType: 'User',
        entityId: 'u1',
        reason: undefined,
        metadata: undefined,
      },
    });
  });
});
