import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService, LOCKOUT_MAX_FAILURES } from './auth.service';

const makeService = (user: unknown, over: { userFailures?: number; originFailures?: number } = {}) => {
  const users = { findActiveByUsername: vi.fn().mockResolvedValue(user) } as any;
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  // 1ª count = falhas do usuário; 2ª = falhas da origem.
  const prisma = {
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi
        .fn()
        .mockResolvedValueOnce(over.userFailures ?? 0)
        .mockResolvedValueOnce(over.originFailures ?? 0),
    },
  } as any;
  return { service: new AuthService(users, jwt, audit, prisma), users, jwt, audit, prisma };
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

    const res = await service.login({ username: 'ana', password: 's3cret' }, '127.0.0.1');

    expect(res).toEqual({
      accessToken: 'signed.jwt.token',
      user: { id: 'u1', name: 'Ana', role: 'CASHIER' },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', name: 'Ana', role: 'CASHIER' });
    expect(audit.log).toHaveBeenCalledWith('AUTH_LOGIN', {
      userId: 'u1', entityType: 'User', entityId: 'u1',
      metadata: { username: 'ana', origin: '127.0.0.1' },
    });
  });

  it('throws Unauthorized and audits LOGIN_FAILED when the password does not match (RB-059)', async () => {
    const { service, audit } = makeService({
      id: 'u1', name: 'Ana', role: 'CASHIER', passwordHash: hash, active: true,
    });
    await expect(service.login({ username: 'ana', password: 'wrong' }, '127.0.0.1'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith('LOGIN_FAILED', {
      entityType: 'User', entityId: 'u1',
      metadata: { username: 'ana', origin: '127.0.0.1' },
    });
  });

  it('throws Unauthorized (same message) and audits LOGIN_FAILED when the user does not exist', async () => {
    const { service, audit } = makeService(null);
    await expect(service.login({ username: 'ghost', password: 'x' }, '127.0.0.1'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith('LOGIN_FAILED', {
      entityType: 'User', entityId: undefined,
      metadata: { username: 'ghost', origin: '127.0.0.1' },
    });
  });

  it('locks out with 429 after LOCKOUT_MAX_FAILURES user failures — before touching credentials (RB-060a)', async () => {
    const { service, users, audit } = makeService(
      { id: 'u1', name: 'Ana', role: 'CASHIER', passwordHash: hash, active: true },
      { userFailures: LOCKOUT_MAX_FAILURES },
    );
    await expect(service.login({ username: 'ana', password: 's3cret' }, '127.0.0.1')).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpException && e.getStatus() === 429,
    );
    expect(users.findActiveByUsername).not.toHaveBeenCalled(); // nem valida credencial
    expect(audit.log).not.toHaveBeenCalled(); // tentativa bloqueada não conta como falha nova
  });

  it('locks out with 429 on too many failures from the same origin (username rotation)', async () => {
    const { service } = makeService(
      { id: 'u1', name: 'Ana', role: 'CASHIER', passwordHash: hash, active: true },
      { userFailures: 0, originFailures: 20 },
    );
    await expect(service.login({ username: 'ana', password: 's3cret' }, '10.0.0.9')).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpException && e.getStatus() === 429,
    );
  });
});
