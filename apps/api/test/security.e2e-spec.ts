import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LOCKOUT_MAX_FAILURES } from '../src/modules/auth/auth.service';

const USER_LOCK = 'e2e_sec_lock'; // só falhas (nem existe) → lockout por usuário
const USER_REAL = 'e2e_sec_real'; // sucesso zera a contagem

/**
 * Baseline de segurança (ADR-0022 — Phase-0 S0-d).
 * RB-059: falha de login auditada (usuário tentado + origem), resposta genérica.
 * RB-060a: lockout 5 falhas/15min por usuário; zera no sucesso.
 * RB-060d: headers de segurança (helmet) e erro sem stack.
 * Nota: audit_logs é append-only (REVOKE) — specs NÃO limpam a trilha; usuários dedicados
 * evitam poluir a contagem de outros specs.
 */
describe('Security baseline — ADR-0022 (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const server = () => app.getHttpServer();
  const tryLogin = (username: string, password: string) =>
    request(server()).post('/api/auth/login').send({ username, password });

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(helmet()); // espelha o main.ts (e2e monta a app à mão)
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('s3cret', 10);
    await prisma.user.upsert({
      where: { username: USER_REAL },
      update: { passwordHash, active: true, role: 'CASHIER' },
      create: { username: USER_REAL, name: 'E2E Sec', role: 'CASHIER', passwordHash },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: USER_REAL } });
    await app.close();
  });

  it('login falho → 401 genérico + LOGIN_FAILED auditado com usuário tentado e origem (RB-059)', async () => {
    const res = await tryLogin(USER_LOCK, 'wrong').expect(401);
    expect(res.body.message).toBe('Credenciais inválidas'); // não revela se o usuário existe
    expect(JSON.stringify(res.body)).not.toContain('wrong'); // senha nunca ecoada
    expect(res.body.stack).toBeUndefined();

    const row = await prisma.auditLog.findFirst({
      where: { eventType: 'LOGIN_FAILED', metadata: { path: ['username'], equals: USER_LOCK } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    const meta = row!.metadata as { username: string; origin: string };
    expect(meta.username).toBe(USER_LOCK);
    expect(meta.origin).toBeTruthy();
  });

  it(`lockout: ${LOCKOUT_MAX_FAILURES} falhas → próxima tentativa 429 (RB-060a)`, async () => {
    // 1 falha já registrada no teste anterior
    for (let i = 1; i < LOCKOUT_MAX_FAILURES; i++) {
      await tryLogin(USER_LOCK, 'wrong').expect(401);
    }
    const locked = await tryLogin(USER_LOCK, 'whatever').expect(429);
    expect(locked.body.message).not.toMatch(/exist|inválid/i); // genérica, sem vazar estado
  });

  it('sucesso zera a contagem: 4 falhas + login ok → falha seguinte volta a ser 401, não 429', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i++) {
      await tryLogin(USER_REAL, 'wrong').expect(401);
    }
    await tryLogin(USER_REAL, 's3cret').expect(200); // zera
    await tryLogin(USER_REAL, 'wrong').expect(401); // 1 falha pós-sucesso < limite
  });

  it('headers de segurança (helmet) presentes nas respostas (RB-060d)', async () => {
    const res = await request(server()).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined(); // fingerprint removido
  });

  it('erro de validação → 400 sem stack e sem eco de valores', async () => {
    const res = await request(server()).post('/api/auth/login').send({ username: 'x' }).expect(400);
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
