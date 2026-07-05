import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-f7-operacao';
const CAT = '00000000-0000-4000-9700-0000000000c1';
const P_SUCO = '00000000-0000-4000-9700-0000000000a1'; // R$12 UNIT
const P_AGUA = '00000000-0000-4000-9700-0000000000a2'; // R$5 UNIT

/**
 * F-7 Relatórios (RB-053/053a): 5 projeções query-time por operação.
 * Vendas = contas PAGAS (SETTLED); exceções via AuditLog na janela da operação.
 */
describe('Reports — 5 relatórios (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let cashier: string;
  let employee: string;
  let sessionId: string;

  const server = () => app.getHttpServer();
  const as = (token: string) => (req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());

  async function cleanup(): Promise<void> {
    await prisma.printJob.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.paymentTender.deleteMany({ where: { payment: { accountGroup: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.payment.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroupMember.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroup.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
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
    for (const u of [
      { username: 'admin', name: 'Administrador', role: 'ADMIN' as const },
      { username: 'caixa', name: 'Caixa', role: 'CASHIER' as const },
      { username: 'garcom', name: 'Garçom', role: 'EMPLOYEE' as const },
    ]) {
      await prisma.user.upsert({ where: { username: u.username }, update: { passwordHash, active: true, role: u.role }, create: { ...u, passwordHash } });
    }
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-f7', active: true, sortOrder: 94 }, create: { id: CAT, name: 'e2e-f7', active: true, sortOrder: 94 } });
    await prisma.product.upsert({ where: { id: P_SUCO }, update: { categoryId: CAT, name: 'e2e-f7-suco', price: '12.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_SUCO, categoryId: CAT, name: 'e2e-f7-suco', price: '12.00', type: 'UNIT', usesObservations: false, active: true } });
    await prisma.product.upsert({ where: { id: P_AGUA }, update: { categoryId: CAT, name: 'e2e-f7-agua', price: '5.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_AGUA, categoryId: CAT, name: 'e2e-f7-agua', price: '5.00', type: 'UNIT', usesObservations: false, active: true } });

    await cleanup();
    const login = async (u: string) =>
      (await request(server()).post('/api/auth/login').send({ username: u, password: '1234' }).expect(200)).body.accessToken;
    admin = await login('admin');
    cashier = await login('caixa');
    employee = await login('garcom');

    // Operação rica: caixa 100 · A = 2×suco (24) − FIXED 4 → 20, pago CASH ·
    // B = água (5), pago PIX · C = suco cancelado + conta cancelada · sangria 10.
    const s = await as(cashier)(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    sessionId = s.body.id;
    await as(cashier)(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);

    const a = await as(cashier)(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 81 })).expect(201);
    await as(cashier)(request(server()).post(`/api/accounts/${a.body.id}/items`).send({ items: [{ productId: P_SUCO, quantity: 2 }] })).expect(201);
    await as(cashier)(request(server()).post(`/api/accounts/${a.body.id}/discount`).send({ type: 'FIXED', value: '4.00', reason: 'cortesia' })).expect(201);
    await as(cashier)(request(server()).post('/api/payments').send({ accountIds: [a.body.id], tenders: [{ method: 'CASH', amount: '20.00' }] })).expect(201);

    const b = await as(cashier)(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 82 })).expect(201);
    await as(cashier)(request(server()).post(`/api/accounts/${b.body.id}/items`).send({ items: [{ productId: P_AGUA, quantity: 1 }] })).expect(201);
    await as(cashier)(request(server()).post('/api/payments').send({ accountIds: [b.body.id], tenders: [{ method: 'PIX', amount: '5.00' }] })).expect(201);

    const c = await as(cashier)(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 83 })).expect(201);
    const placed = await as(cashier)(request(server()).post(`/api/accounts/${c.body.id}/items`).send({ items: [{ productId: P_SUCO, quantity: 1 }] })).expect(201);
    await as(cashier)(request(server()).post(`/api/accounts/${c.body.id}/items/${placed.body.items[0].id}/cancel`).send({ reason: 'pedido errado' })).expect(201);
    await as(cashier)(request(server()).post(`/api/accounts/${c.body.id}/cancel`).send({ reason: 'cliente desistiu' })).expect(201);

    await as(cashier)(request(server()).post('/api/registers/current/withdrawals').send({ amount: '10.00', reason: 'depósito' })).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.product.deleteMany({ where: { id: { in: [P_SUCO, P_AGUA] } } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await app.close();
  });

  it('closing: por caixa — abertura, recebimentos, sangria, esperado corrente (caixa OPEN)', async () => {
    const r = await as(admin)(request(server()).get('/api/reports/closing')).expect(200);
    expect(r.body.businessSessionId).toBe(sessionId);
    expect(r.body.registers).toHaveLength(1);
    expect(r.body.registers[0]).toMatchObject({
      operatorName: 'Caixa',
      status: 'OPEN',
      openingAmount: '100.00',
      cashReceipts: '20.00', // só a parcela CASH (PIX não entra na gaveta)
      cashWithdrawals: '10.00',
      expectedAmount: '110.00', // 100 + 20 − 10
      countedAmount: null,
      difference: null,
    });
  });

  it('sales-by-method: tenders de SETTLED por método (RB-053 §2)', async () => {
    const r = await as(admin)(request(server()).get('/api/reports/sales-by-method')).expect(200);
    expect(r.body.rows).toEqual([
      { method: 'CASH', total: '20.00' },
      { method: 'PIX', total: '5.00' },
    ]);
    expect(r.body.total).toBe('25.00');
  });

  it('sales-by-product: só itens de contas PAGAS, ranking por R$ (conta cancelada fora)', async () => {
    const r = await as(admin)(request(server()).get('/api/reports/sales-by-product')).expect(200);
    expect(r.body.rows).toEqual([
      expect.objectContaining({ productName: 'e2e-f7-suco', categoryName: 'e2e-f7', quantity: 2, total: '24.00' }),
      expect.objectContaining({ productName: 'e2e-f7-agua', quantity: 1, total: '5.00' }),
    ]);
  });

  it('exceptions: cancelamentos + descontos com operador e motivo, por hora (RB-053 §4)', async () => {
    const r = await as(admin)(request(server()).get('/api/reports/exceptions')).expect(200);
    const types = r.body.rows.map((x: { type: string }) => x.type);
    expect(types).toEqual(['DISCOUNT_APPLIED', 'ITEM_CANCELED', 'ACCOUNT_CANCEL']); // ordem temporal
    expect(r.body.rows[1]).toMatchObject({ operatorName: 'Caixa', reason: 'pedido errado', detail: '12.00' });
  });

  it('ticket: receita 25 / 2 contas pagas = 12.50 (RB-053 §5)', async () => {
    const r = await as(admin)(request(server()).get('/api/reports/ticket')).expect(200);
    expect(r.body).toMatchObject({ accountCount: 2, revenue: '25.00', average: '12.50' });
  });

  it('RB-053a: Caixa vê closing mas não os demais (403); Funcionário nada (403); kind inválido 400', async () => {
    await as(cashier)(request(server()).get('/api/reports/closing')).expect(200);
    await as(cashier)(request(server()).get('/api/reports/sales-by-method')).expect(403);
    await as(cashier)(request(server()).get('/api/reports/ticket')).expect(403);
    await as(employee)(request(server()).get('/api/reports/closing')).expect(403);
    await as(admin)(request(server()).get('/api/reports/lucro-magico')).expect(400);
  });

  it('closing pós-fechamento: figuras congeladas (contado × diferença) + relatório por id (operação sem OPEN)', async () => {
    await as(cashier)(request(server()).post('/api/registers/current/close').send({ countedAmount: '109.00' })).expect(201);
    await as(cashier)(request(server()).post('/api/business-sessions/current/close').send({})).expect(201);

    // sem operação aberta e sem id → 409
    await as(admin)(request(server()).get('/api/reports/closing')).expect(409);

    const r = await as(admin)(request(server()).get(`/api/reports/closing?businessSessionId=${sessionId}`)).expect(200);
    expect(r.body.registers[0]).toMatchObject({
      status: 'CLOSED',
      expectedAmount: '110.00',
      countedAmount: '109.00',
      difference: '-1.00',
    });

    // pós-encerramento os demais relatórios seguem consultáveis por id
    const t = await as(admin)(request(server()).get(`/api/reports/ticket?businessSessionId=${sessionId}`)).expect(200);
    expect(t.body.average).toBe('12.50');
  });
});
