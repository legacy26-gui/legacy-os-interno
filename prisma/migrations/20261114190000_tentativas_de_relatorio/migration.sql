-- O robô dos relatórios precisa lembrar quantas vezes já tentou cada loja
-- nesta semana. Sem isto, a loja que falha sempre seria tentada de novo a
-- cada rodada, por horas, gerando a imagem do relatório toda vez antes de
-- descobrir que não vai dar.
CREATE TABLE "tentativas_de_relatorio" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "ultimaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tentativas_de_relatorio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tentativas_de_relatorio_clientId_semana_key"
    ON "tentativas_de_relatorio"("clientId", "semana");

CREATE INDEX "tentativas_de_relatorio_semana_idx"
    ON "tentativas_de_relatorio"("semana");

ALTER TABLE "tentativas_de_relatorio"
    ADD CONSTRAINT "tentativas_de_relatorio_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
