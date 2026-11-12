-- CreateTable
CREATE TABLE "meta_ad_accounts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "name" TEXT,
    "isPrepay" BOOLEAN NOT NULL DEFAULT false,
    "leadActionType" TEXT NOT NULL DEFAULT 'onsite_conversion.messaging_conversation_started_7d',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "availableCents" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adset_insights_daily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "adsetName" TEXT NOT NULL,
    "campaignId" TEXT,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "linkClicks" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL,

    CONSTRAINT "adset_insights_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_accounts_metaAccountId_key" ON "meta_ad_accounts"("metaAccountId");

-- CreateIndex
CREATE INDEX "meta_ad_accounts_clientId_idx" ON "meta_ad_accounts"("clientId");

-- CreateIndex
CREATE INDEX "balance_snapshots_adAccountId_capturedAt_idx" ON "balance_snapshots"("adAccountId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "adset_insights_daily_adAccountId_date_idx" ON "adset_insights_daily"("adAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "adset_insights_daily_adAccountId_adsetId_date_key" ON "adset_insights_daily"("adAccountId", "adsetId", "date");

-- AddForeignKey
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adset_insights_daily" ADD CONSTRAINT "adset_insights_daily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
