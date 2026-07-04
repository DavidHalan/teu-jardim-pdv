-- AlterEnum
ALTER TYPE "CashMovementType" ADD VALUE 'PAYMENT_REVERSAL';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';

-- DropIndex
DROP INDEX "account_group_members_account_id_key";

-- AlterTable
ALTER TABLE "account_group_members" ADD COLUMN     "released_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "account_group_members_account_id_idx" ON "account_group_members"("account_id");

-- RB-039 (ADR-0030): conta em <=1 grupo ATIVO. O unique global de account_id vira PARCIAL:
-- estorno marca released_at (libera a conta p/ re-cobranca) preservando o vinculo historico.
CREATE UNIQUE INDEX "uniq_active_group_member" ON "account_group_members" ("account_id") WHERE "released_at" IS NULL;
