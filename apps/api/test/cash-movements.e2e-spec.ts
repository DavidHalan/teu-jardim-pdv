import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-f1-operacao';

/**
 * F-1 Sangria/Suprimento (RB-010/052).
 * Valor+motivo obrigatórios; só Caixa; idempotente; suprimento soma e sangria
 * subtrai do esperado do fechamento (RB-011); tudo auditado.
 */
describe('Cash movements — sangria/suprimento (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa
  let employeeToken: string; // garçom (não pode)

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());

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
    await prisma.user.upsert({
      where: { username: 'garcom' },
      update: { passwordHash, active: true, role: 'EMPLOYEE' },
      create: { username: 'garcom', name: 'Garçom', role: 'EMPLOYEE', passwordHash },
    });

    await cleanup();
    token = (await request(server()).post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200)).body.accessToken;
    employeeToken = (await request(server()).post('/api/auth/login').send({ username: 'garcom', password: '1234' }).expect(200)).body.accessToken;

    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('suprimento e sangria entram no esperado do fechamento (RB-052: soma/subtrai)', async () => {
    const supply = await auth(request(server()).post('/api/registers/current/supplies').send({ amount: '50.00', reason: 'fundo de troco' })).expect(201);
    expect(supply.body).toMatchObject({ type: 'SUPPLY', amount: '50.00', reason: 'fundo de troco' });

    const withdrawal = await auth(request(server()).post('/api/registers/current/withdrawals').send({ amount: '20.00', reason: 'depósito banco' })).expect(201);
    expect(withdrawal.body).toMatchObject({ type: 'WITHDRAWAL', amount: '20.00' });

    const summary = await auth(request(server()).get('/api/registers/current/closing-summary')).expect(200);
    expect(summary.body).toMatchObject({
      openingAmount: '100.00',
      cashReceipts: '0.00',
      cashSupplies: '50.00',
      cashWithdrawals: '20.00',
      expectedAmount: '130.00', // 100 + 0 + 50 − 20
    });
  });

  it('movements lista todos os tipos, mais recente primeiro', async () => {
    const res = await auth(request(server()).get('/api/registers/current/movements')).expect(200);
    expect(res.body.movements).toHaveLength(2);
    expect(res.body.movements[0]).toMatchObject({ type: 'WITHDRAWAL', amount: '20.00' });
    expect(res.body.movements[1]).toMatchObject({ type: 'SUPPLY', amount: '50.00' });
  });

  it('retry com a mesma Idempotency-Key devolve o MESMO movimento e não duplica', async () => {
    const key = randomUUID();
    const body = { amount: '10.00', reason: 'sangria fim de turno' };
    const fire = () =>
      request(server())
        .post('/api/registers/current/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(body);

    const first = await fire().expect(201);
    const retry = await fire().expect(201);
    expect(retry.body).toEqual(first.body);

    const count = await prisma.cashMovement.count({
      where: { type: 'WITHDRAWAL', reason: 'sangria fim de turno' },
    });
    expect(count).toBe(1);
  });

  it('valida entrada: sem motivo → 400; valor 0 → 400; sem header → 400 (RB-052/060d)', async () => {
    await auth(request(server()).post('/api/registers/current/withdrawals').send({ amount: '10.00', reason: '' })).expect(400);
    await auth(request(server()).post('/api/registers/current/supplies').send({ amount: '0', reason: 'x' })).expect(400);
    await request(server())
      .post('/api/registers/current/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', reason: 'x' })
      .expect(400); // Idempotency-Key obrigatório
  });

  it('garçom não faz sangria/suprimento (RB-052: ação do Caixa → 403)', async () => {
    await request(server())
      .post('/api/registers/current/withdrawals')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '10.00', reason: 'x' })
      .expect(403);
  });

  it('sem caixa aberto → 409 (fecha o caixa e tenta sangrar)', async () => {
    // esperado neste ponto: 100 + 50 − 20 − 10 = 120
    await auth(request(server()).post('/api/registers/current/close').send({ countedAmount: '120.00' }))
      .expect(201)
      .then((res) => expect(res.body).toMatchObject({ expectedAmount: '120.00', difference: '0.00' }));
    await auth(request(server()).post('/api/registers/current/withdrawals').send({ amount: '5.00', reason: 'x' })).expect(409);
  });
});
