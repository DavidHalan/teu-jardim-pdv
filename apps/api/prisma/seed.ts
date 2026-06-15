import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';

// Seed idempotente dos 3 perfis (RB-040..042). Senha padrão local: "1234" — trocar em produção.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('1234', 10);
  const users = [
    { username: 'admin', name: 'Administrador', role: 'ADMIN' as const },
    { username: 'caixa', name: 'Caixa', role: 'CASHIER' as const },
    { username: 'garcom', name: 'Garçom', role: 'EMPLOYEE' as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role, active: true },
      create: { ...u, passwordHash },
    });
  }

  // ---- Catálogo (RB-013..017) — ids fixos = idempotência via upsert ----------
  const STATION_SUCOS = '00000000-0000-4000-8000-000000000010';
  const CAT_SUCOS = '00000000-0000-4000-8000-000000000020';
  const CAT_BEBIDAS = '00000000-0000-4000-8000-000000000021';
  const CAT_REFEICOES = '00000000-0000-4000-8000-000000000022';
  const CAT_SOBREMESAS = '00000000-0000-4000-8000-000000000023';

  await prisma.station.upsert({
    where: { id: STATION_SUCOS },
    update: { name: 'Sucos', active: true },
    create: { id: STATION_SUCOS, name: 'Sucos', active: true },
  });

  const categories = [
    { id: CAT_SUCOS, name: 'Sucos', sortOrder: 1 },
    { id: CAT_BEBIDAS, name: 'Bebidas', sortOrder: 2 },
    { id: CAT_REFEICOES, name: 'Refeições', sortOrder: 3 },
    { id: CAT_SOBREMESAS, name: 'Sobremesas', sortOrder: 4 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: { name: c.name, sortOrder: c.sortOrder, active: true },
      create: { ...c, active: true },
    });
  }

  // Sucos = UNIT, usam observações, roteados à estação de impressão "Sucos".
  // Self service / sobremesa = WEIGHED (preço por kg). Bebidas = UNIT simples.
  const products = [
    { id: '00000000-0000-4000-8000-000000000100', categoryId: CAT_SUCOS, name: 'Suco de Laranja', price: '10.00', type: 'UNIT' as const, usesObservations: true, kdsStationId: STATION_SUCOS },
    { id: '00000000-0000-4000-8000-000000000101', categoryId: CAT_SUCOS, name: 'Suco Verde', price: '12.00', type: 'UNIT' as const, usesObservations: true, kdsStationId: STATION_SUCOS },
    { id: '00000000-0000-4000-8000-000000000102', categoryId: CAT_BEBIDAS, name: 'Coca-Cola 1L', price: '12.00', type: 'UNIT' as const, usesObservations: false, kdsStationId: null },
    { id: '00000000-0000-4000-8000-000000000103', categoryId: CAT_BEBIDAS, name: 'Água 500ml', price: '5.00', type: 'UNIT' as const, usesObservations: false, kdsStationId: null },
    { id: '00000000-0000-4000-8000-000000000104', categoryId: CAT_REFEICOES, name: 'Self Service (kg)', price: '69.90', type: 'WEIGHED' as const, usesObservations: false, kdsStationId: null },
    { id: '00000000-0000-4000-8000-000000000105', categoryId: CAT_SOBREMESAS, name: 'Sobremesa (kg)', price: '49.90', type: 'WEIGHED' as const, usesObservations: false, kdsStationId: null },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { categoryId: p.categoryId, name: p.name, price: p.price, type: p.type, usesObservations: p.usesObservations, kdsStationId: p.kdsStationId, active: true },
      create: { ...p, active: true },
    });
  }

  // Observações dos sucos (RB-016) — ids fixos.
  const observations = [
    { id: '00000000-0000-4000-8000-000000000200', productId: '00000000-0000-4000-8000-000000000100', name: 'Sem açúcar', sortOrder: 1 },
    { id: '00000000-0000-4000-8000-000000000201', productId: '00000000-0000-4000-8000-000000000100', name: 'Com hortelã', sortOrder: 2 },
    { id: '00000000-0000-4000-8000-000000000202', productId: '00000000-0000-4000-8000-000000000100', name: 'Sem gelo', sortOrder: 3 },
    { id: '00000000-0000-4000-8000-000000000203', productId: '00000000-0000-4000-8000-000000000101', name: 'Sem açúcar', sortOrder: 1 },
    { id: '00000000-0000-4000-8000-000000000204', productId: '00000000-0000-4000-8000-000000000101', name: 'Com hortelã', sortOrder: 2 },
  ];
  for (const o of observations) {
    await prisma.productObservation.upsert({
      where: { id: o.id },
      update: { productId: o.productId, name: o.name, sortOrder: o.sortOrder },
      create: o,
    });
  }

  // eslint-disable-next-line no-console
  console.log('[seed] 3 usuários (admin/caixa/garcom, senha 1234) + catálogo (4 categorias, 6 produtos, 5 observações, estação Sucos)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
