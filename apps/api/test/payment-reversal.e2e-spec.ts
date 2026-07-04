import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-f2-operacao';
const CAT = '00000000-0000-4000-9200-0000000000c1';
const P_UNIT = '00000000-0000-4000-9200-0000000000a1'; // R$10,00 UNIT

/**
 * F-2 Estorno de pagamento (RB-048/049/050, ADR-0013/0030).
 * SETTLED → REVERSED empilha (nunca apaga); contas do grupo voltam a OPEN
 * (tudo-ou-nada); parcela em dinheiro sai do caixa (PAYMENT_REVERSAL, subtrai
 * do esperado); vínculo do grupo é liberado (released_at) → re-cobrança possível;
 * bloqueado se número ocupado; Caixa-only; motivo + idem-key obrigatórios.
 */
describe('Payment reversal — estorno (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa
  let employeeToken: string; // garçom (não pode)

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());

  /** Abre conta COMANDA `number`, lança 1 item (R$10) e paga. Devolve { accountId, paymentId }. */
  async function payAccount(
    number: number,
    tenders: { method: string; amount: string }[] = [{ method: 'CASH', amount: '10.00' }],
  ): Promise<{ accountId: string; paymentId: string }> {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT, quantity: 1 }] })).expect(201);
    const pay = await auth(request(server()).post('/api/payments').send({ accountIds: [acc.body.id], tenders })).expect(201);
    return { accountId: acc.body.id, paymentId: pay.body.id };
  }

  async function cleanup(): Promise<void> {
    await prisma.paymentTender.deleteMany({ where: { payment: { accountGroup: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.payment.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroupMember.deleteMany({ where: { accountGroup: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountGroup.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
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
    await prisma.user.upsert({
      where: { username: 'garcom' },
      update: { passwordHash, active: true, role: 'EMPLOYEE' },
      create: { username: 'garcom', name: 'Garçom', role: 'EMPLOYEE', passwordHash },
    });
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-f2', active: true, sortOrder: 97 }, create: { id: CAT, name: 'e2e-f2', active: true, sortOrder: 97 } });
    await prisma.product.upsert({ where: { id: P_UNIT }, update: { categoryId: CAT, name: 'e2e-f2-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_UNIT, categoryId: CAT, name: 'e2e-f2-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true } });

    await cleanup();
    token = (await request(server()).post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200)).body.accessToken;
    employeeToken = (await request(server()).post('/api/auth/login').send({ username: 'garcom', password: '1234' }).expect(200)).body.accessToken;

    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.product.deleteMany({ where: { id: P_UNIT } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await app.close();
  });

  it('estorno reabre a conta, empilha REVERSED e devolve o dinheiro (RB-048/049)', async () => {
    const { accountId, paymentId } = await payAccount(31);

    // lista da operação corrente mostra o pagamento com a referência da conta
    const list = await auth(request(server()).get('/api/payments')).expect(200);
    expect(list.body.payments[0]).toMatchObject({
      id: paymentId,
      status: 'SETTLED',
      total: '10.00',
      accounts: [{ id: accountId, tabType: 'COMANDA', number: 31 }],
    });

    const rev = await auth(
      request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'cobrança errada' }),
    ).expect(201);
    expect(rev.body).toMatchObject({ id: paymentId, status: 'REVERSED', total: '10.00', accountIds: [accountId] });

    // conta voltou a OPEN (ContaReaberta) — snapshot consultável
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe('OPEN');
    expect(account.closedAt).toBeNull();

    // pagamento permanece consultável (nunca apagado)
    const got = await auth(request(server()).get(`/api/payments/${paymentId}`)).expect(200);
    expect(got.body.status).toBe('REVERSED');

    // dinheiro saiu do caixa: PAYMENT_REVERSAL na lista de movimentos + esperado volta a 100
    const movements = await auth(request(server()).get('/api/registers/current/movements')).expect(200);
    expect(movements.body.movements[0]).toMatchObject({ type: 'PAYMENT_REVERSAL', amount: '10.00', reason: 'cobrança errada' });

    const summary = await auth(request(server()).get('/api/registers/current/closing-summary')).expect(200);
    expect(summary.body).toMatchObject({
      cashReceipts: '10.00',
      cashReversals: '10.00',
      expectedAmount: '100.00', // 100 + 10 − 10
    });

    // auditoria crítica na tx: PagamentoEstornado + ContaReaberta
    const audits = await prisma.auditLog.findMany({
      where: { eventType: { in: ['PAYMENT_REVERSED', 'ACCOUNT_REOPENED'] }, entityId: { in: [paymentId, accountId] } },
    });
    expect(audits.map((a) => a.eventType).sort()).toEqual(['ACCOUNT_REOPENED', 'PAYMENT_REVERSED']);
    // cancela a conta reaberta p/ não poluir os próximos cenários
    await auth(request(server()).post(`/api/accounts/${accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('conta estornada pode ser paga DE NOVO (ADR-0030: vínculo liberado, unique parcial)', async () => {
    const { accountId, paymentId } = await payAccount(32);
    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'refazer cobrança' })).expect(201);

    // re-cobrança: mesma conta, novo grupo, novo pagamento — sem P2002
    const again = await auth(
      request(server()).post('/api/payments').send({ accountIds: [accountId], tenders: [{ method: 'PIX', amount: '10.00' }] }),
    ).expect(201);
    expect(again.body.status).toBe('SETTLED');
    expect(again.body.id).not.toBe(paymentId);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe('PAID');
  });

  it('estornar de novo (key nova) → 409: só SETTLED estorna, REVERSED→SETTLED proibido', async () => {
    const { paymentId, accountId } = await payAccount(33);
    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'primeiro' })).expect(201);
    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'segundo' })).expect(409);
    await auth(request(server()).post(`/api/accounts/${accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('retry com a mesma Idempotency-Key devolve o MESMO estorno e não duplica movimento', async () => {
    const { paymentId, accountId } = await payAccount(34);
    const key = randomUUID();
    const fire = () =>
      request(server())
        .post(`/api/payments/${paymentId}/reverse`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ reason: 'retry seguro' });

    const first = await fire().expect(201);
    const retry = await fire().expect(201);
    expect(retry.body).toEqual(first.body);

    const count = await prisma.cashMovement.count({ where: { type: 'PAYMENT_REVERSAL', reason: 'retry seguro' } });
    expect(count).toBe(1);
    await auth(request(server()).post(`/api/accounts/${accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('número reocupado bloqueia o estorno tudo-ou-nada (RB-050 → 409); nada muda', async () => {
    const { paymentId, accountId } = await payAccount(35);
    // número 35 reocupado por conta nova
    const other = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 35 })).expect(201);

    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'não deve passar' })).expect(409);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SETTLED');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe('PAID');

    await auth(request(server()).post(`/api/accounts/${other.body.id}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('estorno de pagamento sem dinheiro (PIX) não gera movimento de caixa (RB-049)', async () => {
    const { paymentId, accountId } = await payAccount(36, [{ method: 'PIX', amount: '10.00' }]);
    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: 'estorno pix' })).expect(201);
    const count = await prisma.cashMovement.count({ where: { type: 'PAYMENT_REVERSAL', reason: 'estorno pix' } });
    expect(count).toBe(0);
    await auth(request(server()).post(`/api/accounts/${accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('valida entrada: sem motivo → 400; sem header → 400; garçom → 403; inexistente → 404', async () => {
    const { paymentId, accountId } = await payAccount(37);

    await auth(request(server()).post(`/api/payments/${paymentId}/reverse`).send({ reason: '' })).expect(400);
    await request(server())
      .post(`/api/payments/${paymentId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'sem chave' })
      .expect(400); // Idempotency-Key obrigatório
    await request(server())
      .post(`/api/payments/${paymentId}/reverse`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'garçom' })
      .expect(403);
    await auth(request(server()).post(`/api/payments/${randomUUID()}/reverse`).send({ reason: 'x' })).expect(404);

    // nada disso mexeu no pagamento
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SETTLED');
    void accountId;
  });
});
