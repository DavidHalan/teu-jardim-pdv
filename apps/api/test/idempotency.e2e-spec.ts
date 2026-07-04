import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-idem-operacao';
const CAT = '00000000-0000-4000-9200-0000000000c1';
const P_UNIT = '00000000-0000-4000-9200-0000000000a1'; // R$10,00 UNIT

/**
 * Idempotência ponta-a-ponta (ADR-0019/0025/0026 — Phase-0 S0-c).
 * Retry com a mesma Idempotency-Key devolve a resposta ORIGINAL sem reexecutar;
 * mesma key com payload diferente → 409; sem header → 400; corrida com a mesma
 * key não duplica (unique (command, key) arbitra no banco).
 */
describe('Idempotency — dedup de comando financeiro (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${token}`);

  async function cleanup(): Promise<void> {
    await prisma.idempotencyKey.deleteMany({});
    await prisma.paymentTender.deleteMany({ where: { payment: { accountGroup: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.payment.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroupMember.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroup.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
    await prisma.accountItemObservation.deleteMany({ where: { accountItem: { account: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.accountItem.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
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
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-idem', active: true, sortOrder: 97 }, create: { id: CAT, name: 'e2e-idem', active: true, sortOrder: 97 } });
    await prisma.product.upsert({ where: { id: P_UNIT }, update: { categoryId: CAT, name: 'e2e-idem-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_UNIT, categoryId: CAT, name: 'e2e-idem-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true } });

    await cleanup();
    const login = await request(server()).post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200);
    token = login.body.accessToken;

    // Operação + caixa (uma vez p/ a suite; contas por teste).
    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.product.deleteMany({ where: { id: P_UNIT } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await app.close();
  });

  async function openAccount(number: number): Promise<string> {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number })).expect(201);
    return acc.body.id as string;
  }

  it('sem header Idempotency-Key → 400 (obrigatório em comando financeiro)', async () => {
    const accountId = await openAccount(60);
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(400);
    await auth(request(server()).post('/api/payments').send({ accountIds: [accountId], tenders: [] })).expect(400);
    await auth(request(server()).post('/api/registers/current/close').send({ countedAmount: '1.00' })).expect(400);
  });

  it('header não-UUID → 400', async () => {
    const accountId = await openAccount(61);
    await auth(
      request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', 'nao-e-uuid').send({ items: [{ productId: P_UNIT, quantity: 1 }] }),
    ).expect(400);
  });

  it('placeOrder: retry com a mesma key não duplica o lote e devolve a resposta original', async () => {
    const accountId = await openAccount(62);
    const key = randomUUID();
    const body = { items: [{ productId: P_UNIT, quantity: 2 }] };

    const first = await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', key).send(body)).expect(201);
    const retry = await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', key).send(body)).expect(201);

    expect(retry.body).toEqual(first.body); // resposta original, byte a byte
    const items = await prisma.accountItem.count({ where: { accountId } });
    expect(items).toBe(1); // 1 linha (quantity 2), não 2 lotes
  });

  it('pay: retry com a mesma key devolve o MESMO pagamento; nada duplica no caixa', async () => {
    const accountId = await openAccount(63);
    const kItems = randomUUID();
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', kItems).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);

    const key = randomUUID();
    const payBody = { accountIds: [accountId], tenders: [{ method: 'CASH', amount: '10.00' }] };
    const first = await auth(request(server()).post('/api/payments').set('Idempotency-Key', key).send(payBody)).expect(201);
    const retry = await auth(request(server()).post('/api/payments').set('Idempotency-Key', key).send(payBody)).expect(201);

    expect(retry.body).toEqual(first.body);
    expect(retry.body.id).toBe(first.body.id);
    const payments = await prisma.payment.count({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    expect(payments).toBe(1);
    const receipts = await prisma.cashMovement.count({ where: { type: 'SALE_RECEIPT', register: { businessSession: { name: SESSION_NAME } } } });
    expect(receipts).toBe(1); // SALE_RECEIPT não duplicou (anti-dupla-contabilização)
  });

  it('mesma key com payload DIFERENTE → 409 (chave é por intenção)', async () => {
    const accountId = await openAccount(64);
    const key = randomUUID();
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', key).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', key).send({ items: [{ productId: P_UNIT, quantity: 5 }] })).expect(409);
  });

  it('erro de domínio NÃO grava a chave — retry pós-erro reexecuta limpo', async () => {
    const accountId = await openAccount(65);
    const key = randomUUID();
    // 1ª tentativa falha na validação (RB-037: tenders ≠ total 0.00 da conta vazia? conta vazia → total 0; tender 5 ≠ 0 → 400)
    await auth(request(server()).post('/api/payments').set('Idempotency-Key', key).send({ accountIds: [accountId], tenders: [{ method: 'CASH', amount: '5.00' }] })).expect(400);
    // chave não ficou presa: mesma key agora com payload correto executa de verdade
    const kItems = randomUUID();
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', kItems).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);
    await auth(request(server()).post('/api/payments').set('Idempotency-Key', key).send({ accountIds: [accountId], tenders: [{ method: 'CASH', amount: '10.00' }] })).expect(201);
  });

  it('corrida: 2 pays simultâneos com a mesma key → 1 pagamento só, mesma resposta', async () => {
    const accountId = await openAccount(66);
    const kItems = randomUUID();
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).set('Idempotency-Key', kItems).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);

    const key = randomUUID();
    const payBody = { accountIds: [accountId], tenders: [{ method: 'CASH', amount: '10.00' }] };
    const fire = () => auth(request(server()).post('/api/payments').set('Idempotency-Key', key).send(payBody));
    const [r1, r2] = await Promise.all([fire(), fire()]);

    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.body.id).toBe(r2.body.id);
    const payments = await prisma.payment.findMany({ where: { accountGroup: { members: { some: { accountId } } } } });
    expect(payments).toHaveLength(1);
  });

  it('closeRegister: retry devolve o fechamento original (caixa já CLOSED não vira 409 no retry)', async () => {
    // fecha o caixa da suite (sem contas OPEN: contas dos testes acima foram pagas; 60/61/64 vazias → cancelar)
    const list = await auth(request(server()).get('/api/accounts')).expect(200);
    for (const a of list.body.accounts) {
      const k = randomUUID();
      await auth(request(server()).post(`/api/accounts/${a.id}/cancel`).set('Idempotency-Key', k).send({ reason: 'e2e idem cleanup' })).expect(201);
    }
    const key = randomUUID();
    const first = await auth(request(server()).post('/api/registers/current/close').set('Idempotency-Key', key).send({ countedAmount: '130.00' })).expect(201);
    const retry = await auth(request(server()).post('/api/registers/current/close').set('Idempotency-Key', key).send({ countedAmount: '130.00' })).expect(201);
    expect(retry.body).toEqual(first.body);
    // key nova (intenção nova) com caixa já fechado → 409 legítimo
    await auth(request(server()).post('/api/registers/current/close').set('Idempotency-Key', randomUUID()).send({ countedAmount: '130.00' })).expect(409);
  });
});
