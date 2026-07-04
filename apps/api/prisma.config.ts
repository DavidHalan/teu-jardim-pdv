import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Lê a URL de forma tolerante: `prisma generate` (postinstall/CI) não precisa de
// conexão, então não deve falhar quando a variável não existe.
// MIGRATION_DATABASE_URL = role pdv (owner/superuser) para migrate/CLI; a aplicação
// roda como pdv_app (DATABASE_URL) sem UPDATE/DELETE em audit_logs (ADR-0025).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
