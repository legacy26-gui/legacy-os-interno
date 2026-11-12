-- CreateTable
CREATE TABLE "meta_insights_daily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "adsetName" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "linkClicks" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL,

    CONSTRAINT "meta_insights_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_lifetime" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "adsetName" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "spendCents" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "linkClicks" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL,
    "desde" DATE,
    "ate" DATE,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_lifetime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_insights_daily_adAccountId_date_idx" ON "meta_insights_daily"("adAccountId", "date");

-- CreateIndex
CREATE INDEX "meta_insights_daily_adAccountId_campaignId_date_idx" ON "meta_insights_daily"("adAccountId", "campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meta_insights_daily_adAccountId_adId_date_key" ON "meta_insights_daily"("adAccountId", "adId", "date");

-- CreateIndex
CREATE INDEX "meta_lifetime_adAccountId_campaignId_idx" ON "meta_lifetime"("adAccountId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_lifetime_adAccountId_adId_key" ON "meta_lifetime"("adAccountId", "adId");

-- AddForeignKey
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lifetime" ADD CONSTRAINT "meta_lifetime_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
