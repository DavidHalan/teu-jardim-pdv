import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SESSION_NAME = 'e2e-f6-operacao';
const STATION = '00000000-0000-4000-9600-0000000000f1';
const CAT = '00000000-0000-4000-9600-0000000000c1';
const P_ROUTED = '00000000-0000-4000-9600-0000000000a1'; // suco (roteado à estação)
const P_PLAIN = '00000000-0000-4000-9600-0000000000a2'; // bebida (sem estação)
const OBS = '00000000-0000-4000-9600-0000000000b1';
const KEY = process.env.PRINT_SERVICE_API_KEY ?? 'dev-print-key-change-me';

/**
 * F-6 thin — fila de cupom de preparo (RB-022/051, ADR-0012/0015/0020).
 * Lançamento roteado enfileira 1 PrintJob por estação, na MESMA tx (retry = replay,
 * não duplica); consumer autentica por chave (poll QUEUED FIFO + ACK idempotente).
 */
describe('Print jobs — fila de cupom (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string; // caixa

  const server = () => app.getHttpServer();
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID());
  const consumer = (req: request.Test): request.Test => req.set('X-Print-Service-Key', KEY);

  async function cleanup(): Promise<void> {
    await prisma.printJob.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
    await prisma.accountItemObservation.deleteMany({ where: { accountItem: { account: { businessSession: { name: SESSION_NAME } } } } });
    await prisma.accountItem.deleteMany({ where: { account: { businessSession: { name: SESSION_NAME } } } });
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
    await prisma.station.upsert({ where: { id: STATION }, update: { name: 'e2e-f6-sucos', active: true }, create: { id: STATION, name: 'e2e-f6-sucos', active: true } });
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-f6', active: true, sortOrder: 96 }, create: { id: CAT, name: 'e2e-f6', active: true, sortOrder: 96 } });
    await prisma.product.upsert({ where: { id: P_ROUTED }, update: { categoryId: CAT, name: 'e2e-f6-suco', price: '10.00', type: 'UNIT', usesObservations: true, kdsStationId: STATION, active: true }, create: { id: P_ROUTED, categoryId: CAT, name: 'e2e-f6-suco', price: '10.00', type: 'UNIT', usesObservations: true, kdsStationId: STATION, active: true } });
    await prisma.product.upsert({ where: { id: P_PLAIN }, update: { categoryId: CAT, name: 'e2e-f6-agua', price: '5.00', type: 'UNIT', usesObservations: false, kdsStationId: null, active: true }, create: { id: P_PLAIN, categoryId: CAT, name: 'e2e-f6-agua', price: '5.00', type: 'UNIT', usesObservations: false, kdsStationId: null, active: true } });
    await prisma.productObservation.upsert({ where: { id: OBS }, update: { productId: P_ROUTED, name: 'Sem açúcar', sortOrder: 1 }, create: { id: OBS, productId: P_ROUTED, name: 'Sem açúcar', sortOrder: 1 } });

    await cleanup();
    token = (await request(server()).post('/api/auth/login').send({ username: 'caixa', password: '1234' }).expect(200)).body.accessToken;

    await auth(request(server()).post('/api/business-sessions').send({ name: SESSION_NAME })).expect(201);
    await auth(request(server()).post('/api/registers').send({ openingAmount: '100.00' })).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.productObservation.deleteMany({ where: { id: OBS } });
    await prisma.product.deleteMany({ where: { id: { in: [P_ROUTED, P_PLAIN] } } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await prisma.station.deleteMany({ where: { id: STATION } });
    await app.close();
  });

  it('lançamento roteado enfileira 1 cupom por estação com payload congelado (RB-022); item sem estação fica fora', async () => {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 61 })).expect(201);
    const key = randomUUID();
    await request(server())
      .post(`/api/accounts/${acc.body.id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ items: [
        { productId: P_ROUTED, quantity: 2, observationIds: [OBS] },
        { productId: P_PLAIN, quantity: 1 },
      ] })
      .expect(201);

    const jobs = await prisma.printJob.findMany({ where: { accountId: acc.body.id } });
    expect(jobs).toHaveLength(1); // água não roteia
    expect(jobs[0]).toMatchObject({ stationId: STATION, batchId: key, status: 'QUEUED' });
    expect(jobs[0].payload).toMatchObject({
      tabType: 'COMANDA',
      number: 61,
      stationName: 'e2e-f6-sucos',
      placedBy: 'Caixa',
      items: [{ name: 'e2e-f6-suco', quantity: 2, weightGrams: null, observations: ['Sem açúcar'] }],
    });
  });

  it('retry do lançamento com a MESMA Idempotency-Key não duplica o cupom (ADR-0015)', async () => {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 62 })).expect(201);
    const key = randomUUID();
    const fire = () =>
      request(server())
        .post(`/api/accounts/${acc.body.id}/items`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ items: [{ productId: P_ROUTED, quantity: 1 }] });

    await fire().expect(201);
    await fire().expect(201); // replay
    const count = await prisma.printJob.count({ where: { accountId: acc.body.id } });
    expect(count).toBe(1);
  });

  it('poll do consumer: QUEUED em FIFO, autenticado por chave; sem/errada chave → 401; JWT não basta', async () => {
    const res = await consumer(request(server()).get('/api/print-jobs?status=QUEUED')).expect(200);
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(2);
    const created = res.body.jobs.map((j: { createdAt: string }) => j.createdAt);
    expect([...created].sort()).toEqual(created); // mais antigo primeiro

    await request(server()).get('/api/print-jobs?status=QUEUED').expect(401);
    await request(server()).get('/api/print-jobs?status=QUEUED').set('X-Print-Service-Key', 'errada').expect(401);
    await request(server()).get('/api/print-jobs?status=QUEUED').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('ACK: QUEUED→PRINTED; re-ACK idempotente; PRINTED→FAILED proibido (409); inexistente 404', async () => {
    const queued = await consumer(request(server()).get('/api/print-jobs?status=QUEUED')).expect(200);
    const job = queued.body.jobs[0];

    const printed = await consumer(request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'PRINTED' })).expect(201);
    expect(printed.body).toMatchObject({ id: job.id, status: 'PRINTED' });
    expect(printed.body.ackedAt).not.toBeNull();

    const again = await consumer(request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'PRINTED' })).expect(201);
    expect(again.body.status).toBe('PRINTED');

    await consumer(request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'FAILED', error: 'x' })).expect(409);
    await consumer(request(server()).post(`/api/print-jobs/${randomUUID()}/ack`).send({ result: 'PRINTED' })).expect(404);

    const got = await consumer(request(server()).get(`/api/print-jobs/${job.id}`)).expect(200);
    expect(got.body.status).toBe('PRINTED');
  });

  it('ACK FAILED registra o erro do device (fila continua consultável)', async () => {
    const queued = await consumer(request(server()).get('/api/print-jobs?status=QUEUED')).expect(200);
    const job = queued.body.jobs[0];
    const failed = await consumer(
      request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'FAILED', error: 'sem papel' }),
    ).expect(201);
    expect(failed.body).toMatchObject({ status: 'FAILED', error: 'sem papel' });

    const list = await consumer(request(server()).get('/api/print-jobs?status=FAILED')).expect(200);
    expect(list.body.jobs.map((j: { id: string }) => j.id)).toContain(job.id);
  });

  it('valida entrada do ACK: result fora de PRINTED/FAILED → 400 (EXPIRED é policy do servidor)', async () => {
    const acc = await auth(request(server()).post('/api/accounts').send({ tabType: 'COMANDA', number: 63 })).expect(201);
    await auth(request(server()).post(`/api/accounts/${acc.body.id}/items`).send({ items: [{ productId: P_ROUTED, quantity: 1 }] })).expect(201);
    const queued = await consumer(request(server()).get('/api/print-jobs?status=QUEUED')).expect(200);
    const job = queued.body.jobs[0];
    await consumer(request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'EXPIRED' })).expect(400);
    await consumer(request(server()).post(`/api/print-jobs/${job.id}/ack`).send({ result: 'QUEUED' })).expect(400);
  });
});
