import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-operacao';

describe('Shift — operação + caixa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${token}`);

  // Limpa SÓ os dados criados pelo e2e (nunca destrutivo no resto).
  async function cleanup(): Promise<void> {
    await prisma.cashMovement.deleteMany({ where: { register: { businessSession: { name: SESSION_NAME } } } });
    await prisma.register.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
    await prisma.businessSession.deleteMany({ where: { name: SESSION_NAME } });
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('1234', 10);
    await prisma.user.upsert({
      where: { username: 'caixa' },
      update: { passwordHash, active: true, role: 'CASHIER' },
      create: { username: 'caixa', name: 'Caixa', role: 'CASHIER', passwordHash },
    });

    await cleanup();
    const login = await request(server())
      .post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('blocks opening a register before any operation is open (RB-008 → 409)', async () => {
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(409);
  });

  it('opens an operation and exposes it as current', async () => {
    const open = await auth(
      request(server()).post('/api/business-sessions').send({ name: SESSION_NAME }),
    ).expect(201);
    expect(open.body).toMatchObject({ name: SESSION_NAME, status: 'OPEN' });

    const current = await auth(request(server()).get('/api/business-sessions/current')).expect(200);
    expect(current.body.session).toMatchObject({ name: SESSION_NAME, status: 'OPEN' });
  });

  it('rejects a second open operation while one is open (RB-007a → 409)', async () => {
    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(409);
  });

  it('opens a register in the current operation and exposes the operator current', async () => {
    const open = await auth(
      request(server()).post('/api/registers').send({ openingAmount: '150.00' }),
    ).expect(201);
    expect(open.body).toMatchObject({ status: 'OPEN', openingAmount: '150.00' });

    const current = await auth(request(server()).get('/api/registers/current')).expect(200);
    expect(current.body.register).toMatchObject({ status: 'OPEN', openingAmount: '150.00' });
  });

  it('rejects a second register for the same operator (idempotency → 409)', async () => {
    await auth(request(server()).post('/api/registers').send({ openingAmount: '50.00' })).expect(409);
  });

  it('rejects an invalid (non-numeric) opening amount with 400 (ValidationPipe)', async () => {
    await auth(request(server()).post('/api/registers').send({ openingAmount: 'abc' })).expect(400);
  });
});
