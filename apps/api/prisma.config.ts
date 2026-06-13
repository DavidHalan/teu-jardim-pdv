import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Lê DATABASE_URL de forma tolerante: `prisma generate` (postinstall/CI) não precisa de
// conexão, então não deve falhar quando a variável não existe. Comandos que conectam
// (migrate) usam o valor real carregado do .env via dotenv.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
