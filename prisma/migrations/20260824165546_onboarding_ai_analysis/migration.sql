-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('PRE_DIAGNOSTICO', 'PLANO_FINAL');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PROCESSANDO', 'CONCLUIDO', 'ERRO');

-- AlterTable
ALTER TABLE "client_onboardings" ADD COLUMN     "enrichment" JSONB,
ADD COLUMN     "meetingNotes" TEXT;

-- CreateTable
CREATE TABLE "onboarding_analyses" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "clientId" TEXT,
    "kind" "AnalysisKind" NOT NULL DEFAULT 'PRE_DIAGNOSTICO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PROCESSANDO',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputData" JSONB NOT NULL,
    "result" JSONB,
    "rawResponse" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "onboarding_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_analyses_onboardingId_kind_version_idx" ON "onboarding_analyses"("onboardingId", "kind", "version");

-- CreateIndex
CREATE INDEX "onboarding_analyses_clientId_idx" ON "onboarding_analyses"("clientId");

-- AddForeignKey
ALTER TABLE "onboarding_analyses" ADD CONSTRAINT "onboarding_analyses_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "client_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
