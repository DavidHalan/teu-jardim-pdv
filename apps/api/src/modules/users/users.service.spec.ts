import { describe, it, expect, vi } from 'vitest';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('finds an active user by username', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'u1', username: 'ana' });
    const prisma = { user: { findFirst } } as any;
    const service = new UsersService(prisma);

    const user = await service.findActiveByUsername('ana');

    expect(findFirst).toHaveBeenCalledWith({
      where: { username: 'ana', active: true },
    });
    expect(user).toEqual({ id: 'u1', username: 'ana' });
  });

  it('returns null when no active user matches', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findFirst } } as any;
    const service = new UsersService(prisma);

    expect(await service.findActiveByUsername('ghost')).toBeNull();
  });
});
