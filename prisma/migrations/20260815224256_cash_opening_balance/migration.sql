-- CreateTable
CREATE TABLE "cash_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "openingBalance" DECIMAL(12,2) NOT NULL,
    "openingMonth" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_settings_pkey" PRIMARY KEY ("id")
);
