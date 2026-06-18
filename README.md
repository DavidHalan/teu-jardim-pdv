# Teu Jardim PDV

[![CI](https://github.com/DavidHalan/teu-jardim-pdv/actions/workflows/ci.yml/badge.svg)](https://github.com/DavidHalan/teu-jardim-pdv/actions/workflows/ci.yml)

Sistema de **PDV (ponto de venda) local-first** para o restaurante **Teu Jardim**. Elimina papel
e comunicação verbal no salão, opera **sem internet** (um servidor na rede local é a única fonte
da verdade) e prioriza velocidade no atendimento por **pulseira, comanda e mesa**.

> **Duplo propósito:** roda em produção real no restaurante **e** serve de peça de portfólio de
> engenharia (modelagem de domínio, arquitetura, processo). O código é em inglês; a comunicação de
> negócio e a documentação interna, em português.

## Índice

- [Características principais](#características-principais)
- [Conceitos de domínio](#conceitos-de-domínio)
- [Stack](#stack)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Pré-requisitos](#pré-requisitos)
- [Rodando localmente](#rodando-localmente)
- [Usuários padrão (seed)](#usuários-padrão-seed)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Scripts](#scripts)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [Integração contínua](#integração-contínua)
- [Status e roadmap](#status-e-roadmap)
- [Deploy](#deploy)
- [Licença](#licença)

## Características principais

- **Local-first:** sem dependência de nuvem; o servidor na LAN é a fonte da verdade. Funciona com a
  internet caída.
- **Conta = sessão de uso:** cada uso de um número (pulseira/comanda/mesa) gera uma conta nova, com
  abertura, itens, desconto e fechamento próprios — preserva histórico e evita corrida de concorrência.
- **Turno operacional explícito:** abrir **operação** → abrir **caixa** → atender → **pagar** →
  fechar caixa → encerrar operação.
- **Produtos unitários e por peso:** itens por unidade (sucos, bebidas) e por peso em gramas
  (self service, sobremesas), com preço congelado no momento do lançamento.
- **Pagamento flexível:** uma venda aceita **múltiplas formas** (dinheiro, PIX, crédito, débito) na
  mesma liquidação.
- **Controle de acesso por perfil:** funcionário (garçom), caixa e administrador.
- **Auditoria de eventos críticos:** login, pedido, desconto, cancelamento, pagamento, abertura e
  fechamento de caixa — registros imutáveis.
- **Dinheiro sem float:** valores sempre como `NUMERIC`/`Decimal`, nunca ponto flutuante.

## Conceitos de domínio

Linguagem ubíqua — termo de negócio (PT) ↔ identificador no código (EN):

| Negócio (PT)                  | Código (EN)                              |
| ----------------------------- | ---------------------------------------- |
| Conta de consumo (sessão)     | `Account`                                |
| Comanda / Pulseira / Mesa     | `tabType: COMANDA \| WRISTBAND \| TABLE` |
| Operação (período operacional)| `BusinessSession`                        |
| Caixa                         | `Register`                               |
| Item da conta                 | `AccountItem`                            |
| Produto por peso              | `type: WEIGHED`                          |
| Lançar pedido                 | `placeOrder` / `placeItems`              |
| Auditoria                     | `auditLog`                               |

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **API (`apps/api`):** NestJS 11 · Prisma 7 (driver adapter `@prisma/adapter-pg`) · PostgreSQL 16
- **Web (`apps/web`):** React 19 + Vite 8 (SPA; MVP em navegador kiosk na LAN, PWA é fase 2)
- **Compartilhado (`packages/shared`):** enums e contratos (DTOs) usados por API **e** web
- **Linguagem:** TypeScript 6 ponta a ponta
- **Tempo real:** Socket.io está na stack, **retido para uso futuro**. No Teu Jardim o KDS é
  **por impressão** (cupom térmico ESC/POS), sem tela de cozinha em tempo real.

## Estrutura do monorepo

```
apps/
  api/                  # NestJS + Prisma + PostgreSQL
    prisma/             #   schema.prisma (modelo de dados) · migrations/ · seed.ts
    src/
      modules/<feature>/#   feature-based: controller + module + service + dto juntos
                        #   (auth, audit, business-sessions, registers, products, accounts, …)
      prisma/           #   PrismaModule/PrismaService (infra)
  web/                  # React + Vite (SPA)
    src/
      screens/          #   telas (Login, Home, NewOrder, OrderScreen, …)
      auth/ catalog/ accounts/ shift/ lib/ styles/
packages/
  shared/               # enums + contratos compartilhados (back ↔ front)
docker-compose.yml      # Postgres 16 local
.github/workflows/ci.yml# CI: lint/typecheck/build/migrate/test/e2e (com Postgres)
```

> O `print-service` ESC/POS (no PC do caixa) é planejado para fase posterior — o frontend nunca
> fala direto com a impressora: envia um print job → a API enfileira → o serviço imprime.

## Pré-requisitos

| Ferramenta | Versão        | Observação                                         |
| ---------- | ------------- | -------------------------------------------------- |
| Node.js    | 20+ (testado em 22) | —                                            |
| pnpm       | 11.6 (via `corepack enable`) | Não instalar o pnpm globalmente à mão |
| Docker     | qualquer recente | Para subir o Postgres local                     |

## Rodando localmente

```bash
# 1. Clonar
git clone https://github.com/DavidHalan/teu-jardim-pdv.git
cd teu-jardim-pdv

# 2. Habilitar o pnpm e instalar (o postinstall já gera o Prisma Client)
corepack enable
pnpm install

# 3. Variáveis de ambiente
cp .env.example .env                 # ajuste credenciais/porta se quiser

# 4. Subir o Postgres (docker compose) e aplicar o schema
pnpm db:up
pnpm --filter @teu-jardim/api exec prisma migrate dev

# 5. Semear usuários + catálogo de produtos
pnpm --filter @teu-jardim/api db:seed

# 6. Rodar API (3000) + Web (5173) em watch
pnpm dev
```

Abra **http://localhost:5173**. Teste de fumaça da API:
**http://localhost:3000/api/health** deve responder `db:up` (prova o caminho ponta a ponta, incl.
o interop CJS do Prisma 7 em runtime).

## Usuários padrão (seed)

O `db:seed` cria três perfis (senha local **`1234`** — trocar em produção) e o catálogo inicial:

| Usuário  | Nome          | Perfil          |
| -------- | ------------- | --------------- |
| `admin`  | Administrador | `ADMIN`         |
| `caixa`  | Caixa         | `CASHIER`       |
| `garcom` | Garçom        | `EMPLOYEE`      |

## Arquitetura

### Camadas e fluxo

```
React (Vite SPA)  ──HTTP /api──▶  NestJS (controllers → services)  ──▶  Prisma 7  ──▶  PostgreSQL
        ▲                                   │
        └──────── contratos tipados ────────┘
                 packages/shared (DTOs/enums)
```

- **API feature-based:** cada módulo em `apps/api/src/modules/<feature>/` reúne controller, module,
  service e DTOs. Guards globais de JWT + perfil; `AuditService` global chamado pelos módulos.
- **Borda de tipos:** o front importa enums do `@teu-jardim/shared` como **valor** (ex.: `Role`). O
  pacote é emitido em **CJS** (consumido via `require` pela API Nest); por isso o dev server do Vite
  usa `optimizeDeps: { include: ['@teu-jardim/shared'] }`. **Não** torne o `shared` ESM-only — quebra
  a API.
- **Prisma 7 é driver-adapter-first:** o `datasource` no schema só tem `provider`; a conexão usa
  `@prisma/adapter-pg`. O client é gerado em `apps/api/src/generated/prisma` (gitignored; recriado no
  `postinstall`).
- **Dinheiro:** Postgres `NUMERIC(12,2)` / Prisma `Decimal`. Toda aritmética monetária é feita com
  `Decimal` (sem float) e trafega como string decimal canônica nos contratos.

### Invariantes de domínio

- **≤ 1 conta aberta por (`tabType`, `number`)** — garantido por um índice único parcial no banco
  (`WHERE status = 'OPEN'`). "Disponível/Em Uso" é estado **derivado**, não coluna.
- **Fechar caixa é bloqueado** enquanto houver conta aberta na operação.
- **Preço congelado no item** no momento do lançamento — relatórios e auditoria corretos no tempo.
- **Eventos críticos geram auditoria** (usuário, data/hora, motivo quando aplicável), imutável.

## Modelo de dados

Principais entidades (fonte: `apps/api/prisma/schema.prisma`):

| Entidade          | Papel                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `User`            | Usuário do sistema (perfil `EMPLOYEE` / `CASHIER` / `ADMIN`)            |
| `BusinessSession` | Operação (período operacional) — `OPEN` / `CLOSED`                       |
| `Register`        | Caixa (PDV), por operador — abertura, movimentações, fechamento          |
| `Account`         | Conta de consumo (sessão) — `OPEN` / `PAID` / `CANCELED`                 |
| `AccountItem`     | Item lançado (UNIT por quantidade, WEIGHED por peso em gramas)          |
| `Product`         | Produto (`UNIT` / `WEIGHED`), categoria, observações, destino de preparo |
| `Payment` / `PaymentTender` | Liquidação de 1+ contas (via grupo) com formas de pagamento     |
| `Discount`        | Desconto na conta (`PERCENT` / `FIXED`)                                  |
| `AuditLog`        | Registro imutável de evento crítico                                      |

## Scripts

Da raiz do monorepo (Turborepo orquestra todos os pacotes):

| Comando                                                  | Descrição                                  |
| ------------------------------------------------------- | ------------------------------------------ |
| `pnpm dev`                                               | API (:3000) + Web (:5173) em watch         |
| `pnpm build`                                             | Build de todos os pacotes                  |
| `pnpm typecheck`                                         | `tsc --noEmit` em todos                     |
| `pnpm test`                                              | Testes unitários (todos)                    |
| `pnpm db:up` / `pnpm db:down`                            | Sobe / para o Postgres (docker compose)    |
| `pnpm --filter @teu-jardim/api exec prisma migrate dev` | Cria/aplica migração                        |
| `pnpm --filter @teu-jardim/api db:seed`                 | Semeia usuários + catálogo                   |
| `pnpm --filter @teu-jardim/api test:e2e`                | Testes e2e (sobe o Nest, usa Postgres real) |
| `pnpm --filter @teu-jardim/web dev`                     | Só o front                                  |

## Variáveis de ambiente

Definidas em `.env` na raiz (ver `.env.example`):

| Variável            | Obrigatória | Descrição                                                           |
| ------------------- | :---------: | ------------------------------------------------------------------- |
| `DATABASE_URL`      |     sim     | String de conexão Postgres consumida pelo Prisma (`apps/api`)       |
| `POSTGRES_USER`     |     —       | Usuário do Postgres do docker compose (default `pdv`)               |
| `POSTGRES_PASSWORD` |     —       | Senha do Postgres do docker compose (default `pdv`)                 |
| `POSTGRES_DB`       |     —       | Banco do docker compose (default `teu_jardim`)                      |
| `POSTGRES_PORT`     |     —       | Porta exposta do Postgres (default `5432`)                          |
| `JWT_SECRET`        |     sim¹    | Segredo de assinatura do JWT de autenticação                        |

¹ Necessário para a autenticação. Defina um valor forte em produção (nunca o de teste).

## Testes

```bash
# Unitários (vitest) — toda a stack
pnpm test

# e2e da API (sobe o Nest e usa um Postgres real; rode com o DB no ar e migrado)
pnpm db:up
pnpm --filter @teu-jardim/api exec prisma migrate deploy
pnpm --filter @teu-jardim/api test:e2e
```

Os testes e2e rodam **em série** (uma só base compartilhada) e referenciam as regras de negócio
(`RB-xxx`) que cobrem.

## Integração contínua

`.github/workflows/ci.yml` roda a cada push na `main` e em cada pull request, com um serviço
Postgres 16: **lint → typecheck → build → `prisma migrate deploy` → testes unitários → e2e**.

## Status e roadmap

Em construção por **walking skeleton** — o fluxo fino `login → conta → item → resumo → pagar →
fechar` atravessa todas as camadas antes de alargar módulo a módulo.

| Fatia | Escopo                                              | Status            |
| ----- | --------------------------------------------------- | ----------------- |
| S1    | Autenticação (JWT + perfis) + infraestrutura        | ✅ entregue        |
| S2    | Operação + caixa (abrir turno, dashboard)           | ✅ entregue        |
| S3    | Abrir conta + lançar item + resumo                  | ✅ entregue        |
| S4    | Pagar + fechar caixa + encerrar operação            | 🚧 em andamento    |

**Depois do esqueleto (alargamento):** KDS por impressão (ESC/POS), estoque, relatórios,
transferência de itens, agrupamento de contas na UI, sangria/suprimento, PWA instalável.

## Deploy

Alvo de produção: **um dos PCs do caixa (Windows)** — a máquina é servidor **e** cliente, em rede
local. Empacotamento via Docker Compose; atualização por tag de release → imagens Docker (CI) →
`docker compose pull && up` no local. Por ser ponto único de falha, **backup noturno do Postgres
para fora da máquina é obrigatório**.

## Licença

[MIT](LICENSE) © 2026 David Halan
