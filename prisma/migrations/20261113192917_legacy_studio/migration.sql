-- CreateEnum
CREATE TYPE "StudioStatus" AS ENUM ('PRONTO', 'APROVADO', 'CORRIGIR');

-- CreateTable
CREATE TABLE "studio_marcas" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "corPrimaria" TEXT NOT NULL DEFAULT '#FFC20E',
    "corFundo" TEXT NOT NULL DEFAULT '#0A0A0A',
    "corTexto" TEXT NOT NULL DEFAULT '#FFFFFF',
    "telefone" TEXT,
    "endereco" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_artes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fotoUrl" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "ano" TEXT,
    "kmTexto" TEXT,
    "precoCents" INTEGER,
    "chamada" TEXT,
    "status" "StudioStatus" NOT NULL DEFAULT 'PRONTO',
    "correcao" TEXT,
    "criadoPorId" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_artes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_marcas_clientId_key" ON "studio_marcas"("clientId");

-- CreateIndex
CREATE INDEX "studio_artes_clientId_criadoEm_idx" ON "studio_artes"("clientId", "criadoEm");

-- CreateIndex
CREATE INDEX "studio_artes_status_criadoEm_idx" ON "studio_artes"("status", "criadoEm");

-- AddForeignKey
ALTER TABLE "studio_marcas" ADD CONSTRAINT "studio_marcas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_artes" ADD CONSTRAINT "studio_artes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_artes" ADD CONSTRAINT "studio_artes_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_artes" ADD CONSTRAINT "studio_artes_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
