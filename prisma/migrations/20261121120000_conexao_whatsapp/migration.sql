-- O estado da conexão do número do robô, pra avisar quando cai e quando volta.
CREATE TABLE "conexao_whatsapp" (
    "id" TEXT NOT NULL DEFAULT 'zapi',
    "conectado" BOOLEAN NOT NULL DEFAULT true,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "falhasSeguidas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "conferidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conexao_whatsapp_pkey" PRIMARY KEY ("id")
);
