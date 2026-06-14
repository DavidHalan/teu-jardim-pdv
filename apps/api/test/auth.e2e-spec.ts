import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const username = 'e2e_user';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash('s3cret', 10);
    await prisma.user.upsert({
      where: { username },
      update: { passwordHash, active: true },
      create: { username, name: 'E2E', role: 'CASHIER', passwordHash },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('logs in with valid credentials and returns a token + user', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ username, password: 's3cret' })
      .expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ name: 'E2E', role: 'CASHIER' });
  });

  it('rejects a wrong password with 401', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({ username, password: 'nope' })
      .expect(401);
  });

  it('rejects /api/auth/me without a token (401) and accepts it with one (200)', async () => {
    await request(server()).get('/api/auth/me').expect(401);

    const login = await request(server())
      .post('/api/auth/login')
      .send({ username, password: 's3cret' });
    await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });
});
