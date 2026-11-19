-- Relatório que o robô da segunda segurou pra gente aprovar.
--
-- Regra do Guilherme: custo por lead abaixo de R$ 12 sai automático; de
-- R$ 12 pra cima passa pela Andrielli.

CREATE TYPE "EstadoDaAprovacao" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

CREATE TABLE "relatorios_para_aprovar" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "cplCents" INTEGER,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "motivoDaEspera" TEXT NOT NULL,
    "estado" "EstadoDaAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoEm" TIMESTAMP(3),
    "decididoPorId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "relatorios_para_aprovar_pkey" PRIMARY KEY ("id")
);

-- Uma loja por semana. É esta trava que impede o robô, que acorda de cinco
-- em cinco minutos, de criar uma aprovação nova a cada rodada.
CREATE UNIQUE INDEX "relatorios_para_aprovar_clientId_semana_key"
    ON "relatorios_para_aprovar"("clientId", "semana");

CREATE INDEX "relatorios_para_aprovar_estado_semana_idx"
    ON "relatorios_para_aprovar"("estado", "semana");

ALTER TABLE "relatorios_para_aprovar"
    ADD CONSTRAINT "relatorios_para_aprovar_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relatorios_para_aprovar"
    ADD CONSTRAINT "relatorios_para_aprovar_decididoPorId_fkey"
    FOREIGN KEY ("decididoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
