-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "fixedExpenseId" TEXT;

-- CreateTable
CREATE TABLE "fixed_expenses" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "dueDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_expenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "fixed_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
