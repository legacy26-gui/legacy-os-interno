-- CreateTable
CREATE TABLE "meta_acoes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quemId" TEXT,
    "nivel" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "statusPedido" TEXT NOT NULL,
    "statusAntes" TEXT,
    "ok" BOOLEAN NOT NULL,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_acoes_clientId_criadoEm_idx" ON "meta_acoes"("clientId", "criadoEm");

-- CreateIndex
CREATE INDEX "meta_acoes_objetoId_criadoEm_idx" ON "meta_acoes"("objetoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "meta_acoes" ADD CONSTRAINT "meta_acoes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_acoes" ADD CONSTRAINT "meta_acoes_quemId_fkey" FOREIGN KEY ("quemId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
