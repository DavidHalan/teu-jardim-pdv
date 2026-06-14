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
  // eslint-disable-next-line no-console
  console.log('[seed] 3 usuários prontos (admin/caixa/garcom, senha 1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
