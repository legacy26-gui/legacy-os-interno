-- Financeiro passo 2: os avisos que o robô já mandou no grupo (vencimentos do dia, resumo da semana).
CREATE TABLE "avisos_financeiros_enviados" (
    "grupoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_financeiros_enviados_pkey" PRIMARY KEY ("grupoId","chave")
);
