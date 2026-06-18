import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-s3-operacao';
const CAT = '00000000-0000-4000-9000-0000000000c1';
const P_UNIT = '00000000-0000-4000-9000-0000000000a1'; // UNIT, R$10,00, com observação
const P_WEIGHED = '00000000-0000-4000-9000-0000000000a2'; // WEIGHED, R$50,00/kg
const P_INACTIVE = '00000000-0000-4000-9000-0000000000a3'; // inativo (RB-017)
const OBS = '00000000-0000-4000-9000-0000000000b1';

describe('Orders — abrir conta + lançar item + resumo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let accountId: string;

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${token}`);

  async function cleanupAccounts(): Promise<void> {
    await prisma.accountItemObservation.deleteMany({
      where: { accountItem: { account: { businessSession: { name: SESSION_NAME } } } },
    });
    await prisma.accountItem.deleteMany({
      where: { account: { businessSession: { name: SESSION_NAME } } },
    });
    await prisma.account.deleteMany({ where: { businessSession: { name: SESSION_NAME } } });
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
      where: { username: 'garcom' },
      update: { passwordHash, active: true, role: 'EMPLOYEE' },
      create: { username: 'garcom', name: 'Garçom', role: 'EMPLOYEE', passwordHash },
    });

    // Catálogo de teste (ids fixos, idempotente).
    await prisma.category.upsert({
      where: { id: CAT },
      update: { name: 'e2e-cat', active: true, sortOrder: 99 },
      create: { id: CAT, name: 'e2e-cat', active: true, sortOrder: 99 },
    });
    await prisma.product.upsert({
      where: { id: P_UNIT },
      update: { categoryId: CAT, name: 'e2e-unit', price: '10.00', type: 'UNIT', usesObservations: true, active: true },
      create: { id: P_UNIT, categoryId: CAT, name: 'e2e-unit', price: '10.00', type: 'UNIT', usesObservations: true, active: true },
    });
    await prisma.product.upsert({
      where: { id: P_WEIGHED },
      update: { categoryId: CAT, name: 'e2e-weighed', price: '50.00', type: 'WEIGHED', usesObservations: false, active: true },
      create: { id: P_WEIGHED, categoryId: CAT, name: 'e2e-weighed', price: '50.00', type: 'WEIGHED', usesObservations: false, active: true },
    });
    await prisma.product.upsert({
      where: { id: P_INACTIVE },
      update: { categoryId: CAT, name: 'e2e-inactive', price: '7.00', type: 'UNIT', usesObservations: false, active: false },
      create: { id: P_INACTIVE, categoryId: CAT, name: 'e2e-inactive', price: '7.00', type: 'UNIT', usesObservations: false, active: false },
    });
    await prisma.productObservation.upsert({
      where: { id: OBS },
      update: { productId: P_UNIT, name: 'Sem açúcar', sortOrder: 1 },
      create: { id: OBS, productId: P_UNIT, name: 'Sem açúcar', sortOrder: 1 },
    });

    await cleanupAccounts();
    const login = await request(server())
      .post('/api/auth/login').send({ username: 'garcom', password: '1234' }).expect(200);
    token = login.body.accessToken;

    // Garçom não abre operação (RB-041 é do caixa); o e2e cria a operação direto no banco.
    await prisma.businessSession.create({ data: { name: SESSION_NAME, openedById: login.body.user.id } });
  });

  // Remove o catálogo de teste (depois das contas, p/ os FKs de accountItem→product estarem limpos).
  async function cleanupCatalog(): Promise<void> {
    await prisma.productObservation.deleteMany({ where: { id: OBS } });
    await prisma.product.deleteMany({ where: { id: { in: [P_UNIT, P_WEIGHED, P_INACTIVE] } } });
    await prisma.category.deleteMany({ where: { id: CAT } });
  }

  afterAll(async () => {
    await cleanupAccounts();
    await cleanupCatalog();
    await app.close();
  });

  it('opens an account (COMANDA 25) in the current operation (RB-006)', async () => {
    const res = await auth(
      request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 25 }),
    ).expect(201);
    expect(res.body).toMatchObject({ tabType: 'COMANDA', number: 25, status: 'OPEN', total: '0.00', items: [] });
    accountId = res.body.id;
  });

  it('rejects a second OPEN account for the same (tabType, number) (RB-003 → 409)', async () => {
    await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 25 })).expect(409);
  });

  it('lists the open account (RB-005 "Em Uso" derivado)', async () => {
    const res = await auth(request(server()).get('/api/accounts')).expect(200);
    expect(res.body.accounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: accountId, tabType: 'COMANDA', number: 25 })]),
    );
  });

  it('places a UNIT item (qty 2) with an observation; total = R$20,00 (RB-018/019/021)', async () => {
    const res = await auth(
      request(server())
        .post(`/api/accounts/${accountId}/items`)
        .send({ items: [{ productId: P_UNIT, quantity: 2, observationIds: [OBS] }] }),
    ).expect(201);
    expect(res.body.total).toBe('20.00');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ quantity: 2, lineTotal: '20.00' });
    expect(res.body.items[0].observations).toEqual([{ text: 'Sem açúcar' }]);
  });

  it('places a WEIGHED item (453 g × R$50,00/kg = R$22,65); total = R$42,65 (RB-014)', async () => {
    const res = await auth(
      request(server())
        .post(`/api/accounts/${accountId}/items`)
        .send({ items: [{ productId: P_WEIGHED, weightGrams: 453 }] }),
    ).expect(201);
    expect(res.body.items.find((i: { lineTotal: string }) => i.lineTotal === '22.65')).toBeTruthy();
    expect(res.body.total).toBe('42.65');
  });

  it('rejects placing an inactive product (RB-017 → 400)', async () => {
    await auth(
      request(server()).post(`/api/accounts/${accountId}/items`).send({ items: [{ productId: P_INACTIVE }] }),
    ).expect(400);
  });

  it('rejects an empty order (ArrayNotEmpty → 400)', async () => {
    await auth(request(server()).post(`/api/accounts/${accountId}/items`).send({ items: [] })).expect(400);
  });

  it('summarizes the account with both items and cached totals (RB-018)', async () => {
    const res = await auth(request(server()).get(`/api/accounts/${accountId}`)).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.subtotal).toBe('42.65');
    expect(res.body.total).toBe('42.65');
  });

  it('returns 404 for placing in a non-existent account', async () => {
    await auth(
      request(server())
        .post('/api/accounts/00000000-0000-4000-9000-0000000000ff/items')
        .send({ items: [{ productId: P_UNIT }] }),
    ).expect(404);
  });
});
