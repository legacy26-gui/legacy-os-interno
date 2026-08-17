-- AlterTable
ALTER TABLE "weekly_reviews" ADD COLUMN     "refMonth" TEXT,
ADD COLUMN     "weekOfMonth" INTEGER;

-- CreateTable
CREATE TABLE "client_sales" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "description" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "adSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "soldAt" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_pinned_info" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pinned_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_sales_clientId_soldAt_idx" ON "client_sales"("clientId", "soldAt");

-- CreateIndex
CREATE INDEX "client_pinned_info_clientId_idx" ON "client_pinned_info"("clientId");

-- AddForeignKey
ALTER TABLE "client_sales" ADD CONSTRAINT "client_sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sales" ADD CONSTRAINT "client_sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_pinned_info" ADD CONSTRAINT "client_pinned_info_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
