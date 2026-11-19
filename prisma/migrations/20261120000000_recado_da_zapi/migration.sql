-- O retrato do que a Z-API manda, pra parar de adivinhar por que uma
-- mensagem de grupo some sem deixar rastro.
--
-- Guarda a ESTRUTURA do recado, nunca o texto da mensagem.

CREATE TABLE "recados_da_zapi" (
    "id" TEXT NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chaves" TEXT NOT NULL,
    "isGroup" BOOLEAN,
    "fromMe" BOOLEAN,
    "de" TEXT,
    "participante" TEXT,
    "numeroDoRobo" TEXT,
    "mencionados" TEXT,
    "temArrobaComNumero" BOOLEAN NOT NULL DEFAULT false,
    "tamanhoDoTexto" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recados_da_zapi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recados_da_zapi_recebidoEm_idx" ON "recados_da_zapi"("recebidoEm");
