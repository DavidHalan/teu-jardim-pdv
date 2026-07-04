-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_command_key_key" ON "idempotency_keys"("command", "key");

-- ─────────────────────────────────────────────────────────────────────────────
-- ADR-0025 — integridade DB-enforced (não expressável no schema.prisma).
-- R-TS1 (test/schema-integrity.e2e-spec.ts) asserta tudo abaixo; migrations
-- futuras que toquem estas tabelas DEVEM preservar estes índices/privilégios.
-- ─────────────────────────────────────────────────────────────────────────────

-- RB-007a: no máximo 1 operação (BusinessSession) OPEN.
CREATE UNIQUE INDEX "uniq_open_business_session" ON "business_sessions" ("status") WHERE "status" = 'OPEN';

-- RB-009a: no máximo 1 caixa OPEN por operador (forma global — decisão do dono, 2026-07-03).
CREATE UNIQUE INDEX "uniq_open_register_per_operator" ON "registers" ("operator_id") WHERE "status" = 'OPEN';

-- Auditoria imutável (RB-044) + role split (ADR-0025): a aplicação roda como pdv_app
-- (não-superuser) sem UPDATE/DELETE em audit_logs. A role é criada FORA da migration
-- (db/init/01-app-role.sh em volume novo; CI/cluster existente: psql à mão) — aqui só
-- privilégios, guardados pela existência da role. R-TS1 falha se a role não existir.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pdv_app') THEN
    GRANT USAGE ON SCHEMA "public" TO pdv_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO pdv_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO pdv_app;
    -- Tabelas/sequences de migrations futuras (criadas pela role que roda migrate) herdam:
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pdv_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT USAGE, SELECT ON SEQUENCES TO pdv_app;
    -- Append-only: auditoria imutável reforçada no banco (RB-044; Constituição §26.3).
    REVOKE UPDATE, DELETE ON "audit_logs" FROM pdv_app;
  END IF;
END
$$;
