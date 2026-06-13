# Teu Jardim PDV

Sistema de **PDV (ponto de venda) local-first** para o restaurante Teu Jardim — elimina
papel e comunicação verbal, opera sem internet (servidor na rede local é a fonte da
verdade) e prioriza velocidade no atendimento de pulseiras, comandas e mesas.

> Projeto de duplo propósito: **uso real** no restaurante e **peça de portfólio** de
> engenharia de software (modelagem, arquitetura, processo).

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **API:** NestJS 11 · Prisma 7 (driver adapter `pg`) · PostgreSQL · Socket.io (KDS em tempo real)
- **Web:** React 19 + Vite 8 (PWA na fase 2; MVP em navegador kiosk na LAN)
- **Compartilhado:** `packages/shared` (tipos/contratos back↔front)
- **Linguagem:** TypeScript 6 ponta a ponta

## Estrutura

```
apps/
  api/      # NestJS + Prisma  (prisma/schema.prisma = modelo de dados)
            #   src/modules/<feature>/ · src/prisma/ (infra)
  web/      # React + Vite
packages/
  shared/   # enums e contratos compartilhados
```

## Rodando localmente

Pré-requisitos: Node 20+, Docker, pnpm (via `corepack enable`).

```bash
pnpm install
cp .env.example .env                 # ajusta credenciais se quiser
pnpm db:up                           # sobe o Postgres (docker compose)
pnpm --filter @teu-jardim/api prisma migrate dev   # cria o schema
pnpm dev                             # api (3000) + web (5173) em watch
```

Acesse `http://localhost:5173` — a tela inicial mostra o health-check da API + banco
(`http://localhost:3000/api/health` deve retornar `db:up`).

## Licença

[MIT](LICENSE) © 2026 David Halan
