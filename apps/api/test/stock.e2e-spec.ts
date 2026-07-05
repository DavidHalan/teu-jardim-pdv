import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const CAT = '00000000-0000-4000-9900-0000000000c1';
const P_UNIT = '00000000-0000-4000-9900-0000000000a1';

/**
 * F-9 Estoque simples (RB-045/046/054): saldo derivado da soma dos movimentos;
 * sem baixa por venda; movimentos só pelo Admin; ajuste exige motivo; auditado.
 */
describe('Stock — estoque simples (e2e, serial)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let cashier: string;

  const server = () => app.getHttpServer();
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${admin}`);

  async function cleanup(): Promise<void> {
    await prisma.stockMovement.deleteMany({ where: { productId: P_UNIT } });
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
    ]) {
      await prisma.user.upsert({ where: { username: u.username }, update: { passwordHash, active: true, role: u.role }, create: { ...u, passwordHash } });
    }
    await prisma.category.upsert({ where: { id: CAT }, update: { name: 'e2e-f9', active: true, sortOrder: 93 }, create: { id: CAT, name: 'e2e-f9', active: true, sortOrder: 93 } });
    await prisma.product.upsert({ where: { id: P_UNIT }, update: { categoryId: CAT, name: 'e2e-f9-suco', price: '10.00', type: 'UNIT', usesObservations: false, active: true }, create: { id: P_UNIT, categoryId: CAT, name: 'e2e-f9-suco', price: '10.00', type: 'UNIT', usesObservations: false, active: true } });

    await cleanup();
    const login = async (u: string) =>
      (await request(server()).post('/api/auth/login').send({ username: u, password: '1234' }).expect(200)).body.accessToken;
    admin = await login('admin');
    cashier = await login('caixa');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.product.deleteMany({ where: { id: P_UNIT } });
    await prisma.category.deleteMany({ where: { id: CAT } });
    await app.close();
  });

  it('saldo derivado: entrada 10 − saída 3 + ajuste −1.5 = 5.5; auditado (RB-045/046)', async () => {
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'IN', quantity: '10' })).expect(201);
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'OUT', quantity: '3' })).expect(201);
    const adjust = await asAdmin(
      request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'ADJUST', quantity: '-1.5', reason: 'quebra na contagem' }),
    ).expect(201);
    expect(adjust.body).toMatchObject({ type: 'ADJUST', quantity: '-1.5', reason: 'quebra na contagem' });

    const res = await asAdmin(request(server()).get('/api/stock')).expect(200);
    const row = res.body.rows.find((r: { productId: string }) => r.productId === P_UNIT);
    expect(row).toMatchObject({ productName: 'e2e-f9-suco', categoryName: 'e2e-f9', balance: '5.5' });

    const audits = await prisma.auditLog.count({
      where: { eventType: 'STOCK_MOVEMENT', metadata: { path: ['productId'], equals: P_UNIT } },
    });
    expect(audits).toBe(3);
  });

  it('guards: ADJUST sem motivo/zero → 400; IN ≤ 0 → 400; produto inexistente → 404; quantity malformada → 400', async () => {
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'ADJUST', quantity: '-2' })).expect(400);
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'ADJUST', quantity: '0', reason: 'x' })).expect(400);
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'IN', quantity: '0' })).expect(400);
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: randomUUID(), type: 'IN', quantity: '1' })).expect(404);
    await asAdmin(request(server()).post('/api/stock/movements').send({ productId: P_UNIT, type: 'IN', quantity: '1.2345' })).expect(400);
  });

  it('RB-054: Caixa não consulta nem movimenta (403); sem venda nenhuma baixa acontece (RB-046)', async () => {
    await request(server()).get('/api/stock').set('Authorization', `Bearer ${cashier}`).expect(403);
    await request(server())
      .post('/api/stock/movements')
      .set('Authorization', `Bearer ${cashier}`)
      .send({ productId: P_UNIT, type: 'IN', quantity: '1' })
      .expect(403);

    // desacoplamento: nada além dos 3 movimentos manuais existe p/ o produto
    const count = await prisma.stockMovement.count({ where: { productId: P_UNIT } });
    expect(count).toBe(3);
  });
});
