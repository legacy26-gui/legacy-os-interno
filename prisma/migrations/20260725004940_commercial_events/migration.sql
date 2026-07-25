-- CreateEnum
CREATE TYPE "CommercialEventType" AS ENUM ('VENDA', 'CHURN');

-- CreateTable
CREATE TABLE "commercial_events" (
    "id" TEXT NOT NULL,
    "type" "CommercialEventType" NOT NULL,
    "companyName" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_events_type_createdAt_idx" ON "commercial_events"("type", "createdAt");
