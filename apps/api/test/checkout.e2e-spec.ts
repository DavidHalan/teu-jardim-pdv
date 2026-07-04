import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-s4-operacao';
const CAT = '00000000-0000-4000-9100-0000000000c1';
const P_UNIT = '00000000-0000-4000-9100-0000000000a1'; // R$10,00 UNIT

describe('Checkout — pagar + fechar (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa

  const server = () => app.getHttpServer();
  // Idempotency-Key fresca por request (comandos financeiros exigem — ADR-0026 §14).
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());

  async function cleanup(): Promise<void> {
    await prisma.paymentTender.deleteMany({ where: { payment: { accountGroup: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.payment.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroupMember.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroup.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
    await prisma.accountItemObservation.deleteMany({ where: { accountItem: { account: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.accountItem.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.discount.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.account.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
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
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-s4', active: true, sortOrder: 98 }, create: { id: CAT, name: 'e2e-s4', active: true, sortOrder: 98 } });
    await prisma.product.upsert({ where: { id: P_UNIT }, update: { categoryId: CAT, name: 'e2e-s4-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_UNIT, categoryId: CAT, name: 'e2e-s4-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true } });

    await cleanup();
    const login = await request(server()).post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.product.deleteMany({ where: { id: P_UNIT } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await app.close();
  });

  it('full flow: abrir operação+caixa → conta+item → desconto → pagar (split) → número liberado → fechar caixa → encerrar operação', async () => {
    // operação + caixa (R$100)
    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);

    // conta COMANDA 25 + 3 itens (R$30)
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 25 })).expect(201);
    const accountId = acc.body.id;
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).send({ items: [{ productId: P_UNIT, quantity: 3 }] })).expect(201);

    // desconto fixo R$5 → total 25,00
    const disc = await auth(request(server()).post(`/api/accounts/${accountId}/discount`).send({ type: 'FIXED', value: '5.00' })).expect(201);
    expect(disc.body.total).toBe('25.00');

    // pagar split: R$15 PIX + R$10 dinheiro
    const pay = await auth(request(server()).post('/api/payments').send({
      accountIds: [accountId],
      tenders: [{ method: 'PIX', amount: '15.00' }, { method: 'CASH', amount: '10.00' }],
    })).expect(201);
    expect(pay.body).toMatchObject({ status: 'SETTLED', total: '25.00' });

    // conta agora PAID; número 25 liberado → reabrir COMANDA 25 funciona (RB-005/038)
    const summary = await auth(request(server()).get(`/api/accounts/${accountId}`)).expect(200);
    expect(summary.body.status).toBe('PAID');
    const reopen = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 25 })).expect(201);
    // cancelar essa conta reaberta (vazia) p/ não travar o fechamento
    await auth(request(server()).post(`/api/accounts/${reopen.body.id}/cancel`).send({ reason: 'e2e cleanup' })).expect(201);

    // prévia do fechamento: esperado = 100 + 10 (só a parcela dinheiro) = 110
    const close1 = await auth(request(server()).get('/api/registers/current/closing-summary')).expect(200);
    expect(close1.body).toMatchObject({ expectedAmount: '110.00', cashReceipts: '10.00', openAccountCount: 0 });

    // fechar caixa: contado 112 → diferença +2
    const closed = await auth(request(server()).post('/api/registers/current/close').send({ countedAmount: '112.00' })).expect(201);
    expect(closed.body).toMatchObject({ status: 'CLOSED', expectedAmount: '110.00', countedAmount: '112.00', difference: '2.00' });

    // encerrar operação
    const ended = await auth(request(server()).post('/api/business-sessions/current/close')).expect(201);
    expect(ended.body.status).toBe('CLOSED');
  });

  it('rejeita pagar quando a soma dos tenders ≠ total (RB-037 → 400)', async () => {
    await cleanup();
    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '50.00' })).expect(201);
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'TABLE', number: 7 })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);
    await auth(request(server()).post('/api/payments').send({ accountIds: [acc.body.id], tenders: [{ method: 'CASH', amount: '5.00' }] })).expect(400);
  });

  it('bloqueia fechar o caixa enquanto houver conta aberta (RB-012/012a → 409)', async () => {
    // estado da asserção anterior: conta TABLE 7 ainda OPEN
    await auth(request(server()).post('/api/registers/current/close').send({ countedAmount: '50.00' })).expect(409);
    // resolver e limpar
    const list = await auth(request(server()).get('/api/accounts')).expect(200);
    for (const a of list.body.accounts) {
      await auth(request(server()).post(`/api/accounts/${a.id}/cancel`).send({ reason: 'e2e' })).expect(201);
    }
  });

  it('rejeita pagar a mesma conta duas vezes (RB-039 → 409)', async () => {
    await cleanup();
    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '0.00' })).expect(201);
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'WRISTBAND', number: 3 })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);
    await auth(request(server()).post('/api/payments').send({ accountIds: [acc.body.id], tenders: [{ method: 'CASH', amount: '10.00' }] })).expect(201);
    // segunda tentativa: conta PAID → 409
    await auth(request(server()).post('/api/payments').send({ accountIds: [acc.body.id], tenders: [{ method: 'CASH', amount: '10.00' }] })).expect(409);
  });
});
