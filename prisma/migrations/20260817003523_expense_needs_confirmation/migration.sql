-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paidDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "expenses_date_paid_idx" ON "expenses"("date", "paid");
