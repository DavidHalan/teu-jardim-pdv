import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-f3-operacao';
const CAT = '00000000-0000-4000-9300-0000000000c1';
const P_UNIT = '00000000-0000-4000-9300-0000000000a1'; // R$10,00 UNIT

/**
 * F-3 Cancelar item (RB-029/031/056) + recálculo uniforme (RB-028/034, decisão dono
 * 2026-07-05): desconto re-derivado do último aplicado a cada mudança de itens —
 * PERCENT acompanha o subtotal, FIXED clampa (total nunca negativo).
 */
describe('Account items — cancelar item (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa
  let employeeToken: string; // garçom (não cancela)

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());

  /** Abre conta COMANDA `number` com `qty` itens de R$10. Devolve { accountId, itemIds }. */
  async function openWithItems(number: number, qty: number): Promise<{ accountId: string; itemIds: string[] }> {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number })).expect(201);
    const placed = await auth(
      request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT, quantity: qty }] }),
    ).expect(201);
    return { accountId: acc.body.id, itemIds: placed.body.items.map((i: { id: string }) => i.id) };
  }

  async function cleanup(): Promise<void> {
    await prisma.printJob.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.itemTransfer.deleteMany({ where: { fromAccount: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountItem.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.discount.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.account.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
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
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-f3', active: true, sortOrder: 95 }, create: { id: CAT, name: 'e2e-f3', active: true, sortOrder: 95 } });
    await prisma.product.upsert({ where: { id: P_UNIT }, update: { categoryId: CAT, name: 'e2e-f3-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_UNIT, categoryId: CAT, name: 'e2e-f3-unit', price: '10.00', type: 'UNIT', usesObservations: false, active: true } });

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

  it('cancela item com motivo: some do resumo, totais recalculam, audit ITEM_CANCELED (RB-029/031)', async () => {
    const { accountId, itemIds } = await openWithItems(71, 3); // 30,00
    const res = await auth(
      request(server()).post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`).send({ reason: 'pedido errado' }),
    ).expect(201);

    // lote de 3 = 1 item row (quantity 3)? Não: quantity=3 numa linha só — cancelar cancela a LINHA.
    expect(res.body.items).toHaveLength(0);
    expect(res.body.subtotal).toBe('0.00');
    expect(res.body.total).toBe('0.00');

    const audit = await prisma.auditLog.count({ where: { eventType: 'ITEM_CANCELED', entityId: itemIds[0] } });
    expect(audit).toBe(1);
  });

  it('desconto PERCENT re-deriva no cancelamento; FIXED clampa — total nunca negativo (RB-028/034)', async () => {
    // duas linhas de 10 (lotes separados) + desconto 10% → cancela uma → desconto 1,00, total 9,00
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 72 })).expect(201);
    const a = await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT }] })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT }] })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/discount`).send({ type: 'PERCENT', value: '10' })).expect(201);

    const afterPercent = await auth(
      request(server()).post(`/api/accounts/${acc.body.id}/items/${a.body.items[0].id}/cancel`).send({ reason: 'x' }),
    ).expect(201);
    expect(afterPercent.body).toMatchObject({ subtotal: '10.00', discountTotal: '1.00', total: '9.00' });

    // troca p/ FIXED 30 (> subtotal 10) → clampa: total 0,00
    const afterFixed = await auth(
      request(server()).post(`/api/accounts/${acc.body.id}/discount`).send({ type: 'FIXED', value: '30.00' }),
    ).expect(201);
    expect(afterFixed.body).toMatchObject({ subtotal: '10.00', discountTotal: '10.00', total: '0.00' });
  });

  it('RB-028 uniforme: lançar item novo re-expande o desconto PERCENT', async () => {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 73 })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT }] })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/discount`).send({ type: 'PERCENT', value: '10' })).expect(201);

    const after = await auth(
      request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_UNIT }] }),
    ).expect(201);
    expect(after.body).toMatchObject({ subtotal: '20.00', discountTotal: '2.00', total: '18.00' });
  });

  it('transfere item: some da origem, entra no destino, 2 totais recalculam, SEM cupom novo (RB-032/033/034)', async () => {
    const origem = await openWithItems(75, 2); // 20,00
    await auth(request(server()).post(`/api/accounts/${origem.accountId}/discount`).send({ type: 'PERCENT', value: '10' })).expect(201);
    const destino = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 76 })).expect(201);
    const jobsBefore = await prisma.printJob.count();

    const res = await auth(
      request(server())
        .post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`)
        .send({ toAccountId: destino.body.id }),
    ).expect(201);

    // origem: linha (2x10=20) saiu inteira → subtotal 0, desconto re-derivado 0
    expect(res.body).toMatchObject({ subtotal: '0.00', discountTotal: '0.00', total: '0.00' });

    const dest = await auth(request(server()).get(`/api/accounts/${destino.body.id}`)).expect(200);
    expect(dest.body.items).toHaveLength(1);
    expect(dest.body).toMatchObject({ subtotal: '20.00', total: '20.00' });

    // RB-033: transferência NÃO reimprime — nenhum PrintJob novo
    expect(await prisma.printJob.count()).toBe(jobsBefore);

    const transfer = await prisma.itemTransfer.findFirst({ where: { accountItemId: origem.itemIds[0] } });
    expect(transfer).toMatchObject({ fromAccountId: origem.accountId, toAccountId: destino.body.id });
    const audit = await prisma.auditLog.count({ where: { eventType: 'ITEM_TRANSFERRED', entityId: origem.itemIds[0] } });
    expect(audit).toBe(1);

    await auth(request(server()).post(`/api/accounts/${origem.accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
    await auth(request(server()).post(`/api/accounts/${destino.body.id}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('transfer guards: garçom 403 · destino = origem 400 · inexistente 404 · destino não OPEN 409 · item cancelado 409', async () => {
    const origem = await openWithItems(77, 1);
    const destino = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 78 })).expect(201);

    await request(server())
      .post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ toAccountId: destino.body.id })
      .expect(403);
    await auth(
      request(server()).post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`).send({ toAccountId: origem.accountId }),
    ).expect(400);
    await auth(
      request(server()).post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`).send({ toAccountId: randomUUID() }),
    ).expect(404);

    await auth(request(server()).post(`/api/accounts/${destino.body.id}/cancel`).send({ reason: 'e2e' })).expect(201);
    await auth(
      request(server()).post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`).send({ toAccountId: destino.body.id }),
    ).expect(409); // destino CANCELED

    await auth(request(server()).post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/cancel`).send({ reason: 'x' })).expect(201);
    const outro = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 79 })).expect(201);
    await auth(
      request(server()).post(`/api/accounts/${origem.accountId}/items/${origem.itemIds[0]}/transfer`).send({ toAccountId: outro.body.id }),
    ).expect(409); // item cancelado não transfere

    await auth(request(server()).post(`/api/accounts/${origem.accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
    await auth(request(server()).post(`/api/accounts/${outro.body.id}/cancel`).send({ reason: 'e2e' })).expect(201);
  });

  it('guards: sem motivo 400 · garçom 403 · já cancelado 409 · item inexistente 404 · conta não OPEN 409', async () => {
    const { accountId, itemIds } = await openWithItems(74, 1);

    await auth(request(server()).post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`).send({ reason: '' })).expect(400);
    await request(server())
      .post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ reason: 'garçom' })
      .expect(403);

    await auth(request(server()).post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`).send({ reason: 'ok' })).expect(201);
    await auth(request(server()).post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`).send({ reason: 'de novo' })).expect(409);
    await auth(request(server()).post(`/api/accounts/${accountId}/items/${randomUUID()}/cancel`).send({ reason: 'x' })).expect(404);

    await auth(request(server()).post(`/api/accounts/${accountId}/cancel`).send({ reason: 'e2e' })).expect(201);
    await auth(request(server()).post(`/api/accounts/${accountId}/items/${itemIds[0]}/cancel`).send({ reason: 'x' })).expect(409);
  });
});
