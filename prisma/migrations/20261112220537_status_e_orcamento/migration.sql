-- AlterTable
ALTER TABLE "meta_ad_creatives" ADD COLUMN     "adsetId" TEXT,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "effectiveStatus" TEXT;

-- AlterTable
ALTER TABLE "meta_insights_daily" ADD COLUMN     "reach" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "meta_lifetime" ADD COLUMN     "reach" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "meta_campaigns" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "objective" TEXT,
    "dailyBudgetCents" INTEGER,
    "lifetimeBudgetCents" INTEGER,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_adsets" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "dailyBudgetCents" INTEGER,
    "lifetimeBudgetCents" INTEGER,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_adsets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_campaigns_adAccountId_campaignId_key" ON "meta_campaigns"("adAccountId", "campaignId");

-- CreateIndex
CREATE INDEX "meta_adsets_adAccountId_campaignId_idx" ON "meta_adsets"("adAccountId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_adsets_adAccountId_adsetId_key" ON "meta_adsets"("adAccountId", "adsetId");

-- AddForeignKey
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_adsets" ADD CONSTRAINT "meta_adsets_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
