-- Os três motivos de uma loja parar de vender viram registro.
--
-- Vídeo já tinha: a baixa da entrega, em Gravações.
-- Arte vira uma data no cliente, igual à última visita.
-- Comercial vira log, porque o que importa é a sequência — falei dia 12,
-- reuni dia 20 — e campo único apagaria o passo anterior.

ALTER TABLE "clients" ADD COLUMN "ultimaArteEm" TIMESTAMP(3);

CREATE TYPE "TipoDeResgate" AS ENUM ('CONTATO', 'REUNIAO');

CREATE TABLE "acoes_de_resgate" (
  "id"         TEXT NOT NULL,
  "clientId"   TEXT NOT NULL,
  "tipo"       "TipoDeResgate" NOT NULL,
  "quando"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "quemId"     TEXT,
  "observacao" TEXT,
  CONSTRAINT "acoes_de_resgate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "acoes_de_resgate_clientId_quando_idx" ON "acoes_de_resgate"("clientId", "quando");

ALTER TABLE "acoes_de_resgate" ADD CONSTRAINT "acoes_de_resgate_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pessoa que sai do sistema não apaga o que ela fez: a ação continua, só
-- perde o nome de quem fez.
ALTER TABLE "acoes_de_resgate" ADD CONSTRAINT "acoes_de_resgate_quemId_fkey"
  FOREIGN KEY ("quemId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
