-- Módulo Gestão de Contas: revisões diárias/semanais e log de alterações de campanha
-- CreateEnum
CREATE TYPE "CampaignChangeType" AS ENUM ('CAMPANHA_CRIADA', 'CAMPANHA_PAUSADA', 'CRIATIVO_ALTERADO', 'CRIATIVO_NOVO', 'PUBLICO_ALTERADO', 'ORCAMENTO_ALTERADO', 'OUTRO');

-- CreateTable
CREATE TABLE "daily_reviews" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "checkedCpl" BOOLEAN NOT NULL DEFAULT false,
    "checkedBudget" BOOLEAN NOT NULL DEFAULT false,
    "checkedRejected" BOOLEAN NOT NULL DEFAULT false,
    "checkedFrequency" BOOLEAN NOT NULL DEFAULT false,
    "checkedComments" BOOLEAN NOT NULL DEFAULT false,
    "checkedLeads" BOOLEAN NOT NULL DEFAULT false,
    "checkedLeadDelivery" BOOLEAN NOT NULL DEFAULT false,
    "checkedService" BOOLEAN NOT NULL DEFAULT false,
    "checkedScheduling" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reviews" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "createdCreative" BOOLEAN NOT NULL DEFAULT false,
    "createdAd" BOOLEAN NOT NULL DEFAULT false,
    "testedAudience" BOOLEAN NOT NULL DEFAULT false,
    "updatedOffers" BOOLEAN NOT NULL DEFAULT false,
    "reportSent" BOOLEAN NOT NULL DEFAULT false,
    "clientReplied" BOOLEAN NOT NULL DEFAULT false,
    "adjustmentsDone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_changes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "responsibleId" TEXT,
    "type" "CampaignChangeType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_reviews_clientId_createdAt_idx" ON "daily_reviews"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "weekly_reviews_clientId_createdAt_idx" ON "weekly_reviews"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_changes_clientId_createdAt_idx" ON "campaign_changes"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "daily_reviews" ADD CONSTRAINT "daily_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reviews" ADD CONSTRAINT "daily_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_changes" ADD CONSTRAINT "campaign_changes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_changes" ADD CONSTRAINT "campaign_changes_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

