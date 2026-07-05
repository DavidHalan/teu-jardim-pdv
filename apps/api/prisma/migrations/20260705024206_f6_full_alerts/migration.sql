-- AlterTable
ALTER TABLE "print_jobs" ADD COLUMN     "dismissed_at" TIMESTAMP(3),
ADD COLUMN     "placed_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_placed_by_id_fkey" FOREIGN KEY ("placed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
