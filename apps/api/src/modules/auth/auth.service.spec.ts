import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const makeService = (user: unknown) => {
  const users = { findActiveByUsername: vi.fn().mockResolvedValue(user) } as any;
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  return { service: new AuthService(users, jwt, audit), users, jwt, audit };
};

describe('AuthService.login', () => {
  let hash: string;
  beforeEach(async () => {
    hash = await bcrypt.hash('s3cret', 10);
  });

  it('returns token + user and audits AUTH_LOGIN on valid credentials', async () => {
    const { service, jwt, audit } = makeService({
      id: 'u1', name: 'Ana', role: 'CASHIER', passwordHash: hash, active: true,
    });

    const res = await service.login({ username: 'ana', password: 's3cret' });

    expect(res).toEqual({
      accessToken: 'signed.jwt.token',
      user: { id: 'u1', name: 'Ana', role: 'CASHIER' },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', name: 'Ana', role: 'CASHIER' });
    expect(audit.log).toHaveBeenCalledWith('AUTH_LOGIN', {
      userId: 'u1', entityType: 'User', entityId: 'u1',
    });
  });

  it('throws Unauthorized when the password does not match', async () => {
    const { service } = makeService({
      id: 'u1', name: 'Ana', role: 'CASHIER', passwordHash: hash, active: true,
    });
    await expect(service.login({ username: 'ana', password: 'wrong' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized when the user does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.login({ username: 'ghost', password: 'x' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
