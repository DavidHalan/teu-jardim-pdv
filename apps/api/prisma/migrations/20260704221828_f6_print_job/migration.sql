-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'PRINTED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- CreateIndex
CREATE INDEX "print_jobs_account_id_idx" ON "print_jobs"("account_id");

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-0015: retry nao duplica cupom — <=1 QUEUED por (conta, estacao, lancamento).
-- Reimpressao deliberada (pos-MVP) cria job NOVO apos o anterior sair de QUEUED.
CREATE UNIQUE INDEX "uniq_queued_print_job" ON "print_jobs" ("account_id", "station_id", "batch_id") WHERE "status" = 'QUEUED';

-- Runtime role (ADR-0025): grant explicito na tabela nova (nao depender so do default privilege).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pdv_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "print_jobs" TO pdv_app;
  END IF;
END
$$;
