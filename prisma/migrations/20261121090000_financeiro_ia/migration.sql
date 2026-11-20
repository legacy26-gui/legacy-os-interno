-- Financeiro pela IA: grupo de gastos no WhatsApp, gasto pessoal (retirada) e
-- a pergunta "pessoal ou empresa?" que fica aberta.

ALTER TABLE "expenses" ADD COLUMN "origem" TEXT;
ALTER TABLE "expenses" ADD COLUMN "loteId" TEXT;
CREATE INDEX "expenses_loteId_idx" ON "expenses"("loteId");

CREATE TABLE "grupos_financeiros" (
    "grupoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grupos_financeiros_pkey" PRIMARY KEY ("grupoId")
);
CREATE INDEX "grupos_financeiros_donoId_idx" ON "grupos_financeiros"("donoId");
ALTER TABLE "grupos_financeiros" ADD CONSTRAINT "grupos_financeiros_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "gastos_pessoais" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'sistema',
    "loteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gastos_pessoais_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gastos_pessoais_donoId_date_idx" ON "gastos_pessoais"("donoId", "date");
CREATE INDEX "gastos_pessoais_empresa_date_idx" ON "gastos_pessoais"("empresa", "date");
CREATE INDEX "gastos_pessoais_loteId_idx" ON "gastos_pessoais"("loteId");
ALTER TABLE "gastos_pessoais" ADD CONSTRAINT "gastos_pessoais_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pendencias_financeiras" (
    "grupoId" TEXT NOT NULL,
    "itens" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pendencias_financeiras_pkey" PRIMARY KEY ("grupoId")
);
