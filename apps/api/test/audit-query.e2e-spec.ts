import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const MARK = 'e2e-f8'; // eventType exclusivo — audit é append-only, não dá pra limpar

/**
 * F-8 Auditoria-query (RB-043/044): trilha imutável consultável só pelo Admin;
 * entradas de EVENTO (não field-diff); desc; cursor keyset estável.
 */
describe('Audit query — consulta da trilha (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let cashier: string;
  let employee: string;
  let adminId: string;

  const server = () => app.getHttpServer();

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
    const login = async (u: string) =>
      (await request(server()).post('/api/auth/login').send({ username: u, password: '1234' }).expect(200)).body.accessToken;
    admin = await login('admin');
    cashier = await login('caixa');
    employee = await login('garcom');
    adminId = (await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;

    // 5 eventos marcados (espaçados p/ ordem estável) + 1 de outro autor
    const base = Date.now() - 60_000;
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({
        data: {
          eventType: MARK,
          userId: adminId,
          entityType: 'Test',
          entityId: `t${i}`,
          reason: `motivo ${i}`,
          metadata: { seq: i },
          createdAt: new Date(base + i * 1000),
        },
      });
    }
  });

  afterAll(async () => {
    await app.close(); // audit é append-only (REVOKE DELETE) — entradas de teste ficam, por design
  });

  it('Admin consulta desc com autor resolvido e metadata; filtro por eventType', async () => {
    const res = await request(server())
      .get(`/api/audit?eventType=${MARK}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    expect(res.body.entries).toHaveLength(5);
    expect(res.body.entries[0]).toMatchObject({
      eventType: MARK,
      userName: 'Administrador',
      entityId: 't4', // mais recente primeiro
      reason: 'motivo 4',
      metadata: { seq: 4 },
    });
  });

  it('cursor keyset: páginas de 2 sem overlap até esgotar', async () => {
    const page = (cursor?: string) =>
      request(server())
        .get(`/api/audit?eventType=${MARK}&limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

    const p1 = await page();
    expect(p1.body.entries.map((e: { entityId: string }) => e.entityId)).toEqual(['t4', 't3']);
    expect(p1.body.nextCursor).not.toBeNull();

    const p2 = await page(p1.body.nextCursor);
    expect(p2.body.entries.map((e: { entityId: string }) => e.entityId)).toEqual(['t2', 't1']);

    const p3 = await page(p2.body.nextCursor);
    expect(p3.body.entries.map((e: { entityId: string }) => e.entityId)).toEqual(['t0']);
    expect(p3.body.nextCursor).toBeNull();
  });

  it('filtros por período e por usuário', async () => {
    const all = await request(server())
      .get(`/api/audit?eventType=${MARK}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const third = all.body.entries[2]; // t2

    const since = await request(server())
      .get(`/api/audit?eventType=${MARK}&from=${encodeURIComponent(third.createdAt)}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(since.body.entries.map((e: { entityId: string }) => e.entityId)).toEqual(['t4', 't3', 't2']);

    const byUser = await request(server())
      .get(`/api/audit?eventType=${MARK}&userId=${adminId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(byUser.body.entries).toHaveLength(5);
  });

  it('RB-044: Caixa e Funcionário não acessam (403); validação de query (400)', async () => {
    await request(server()).get('/api/audit').set('Authorization', `Bearer ${cashier}`).expect(403);
    await request(server()).get('/api/audit').set('Authorization', `Bearer ${employee}`).expect(403);
    await request(server()).get('/api/audit?limit=999').set('Authorization', `Bearer ${admin}`).expect(400);
    await request(server()).get('/api/audit?from=ontem').set('Authorization', `Bearer ${admin}`).expect(400);
    await request(server()).get('/api/audit?cursor=nao-uuid').set('Authorization', `Bearer ${admin}`).expect(400);
  });
});
