-- A caixinha do dia: "passei por este cliente hoje".
--
-- Não é a revisão diária, que exige foto da campanha e continua existindo do
-- lado. Misturar as duas faria um clique valer por uma conferência de
-- verdade, e a foto deixaria de ser cobrada sem ninguém decidir isso.
--
-- O que esta tabela resolve é não perder cliente de vista: uma linha por
-- cliente por dia. Sem linha, ninguém olhou.

CREATE TABLE "clientes_conferidos" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "dia"       DATE NOT NULL,
  "quemId"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clientes_conferidos_pkey" PRIMARY KEY ("id")
);

-- Um cliente é conferido uma vez por dia: clicar duas vezes não duplica.
CREATE UNIQUE INDEX "clientes_conferidos_clientId_dia_key" ON "clientes_conferidos"("clientId", "dia");
CREATE INDEX "clientes_conferidos_dia_idx" ON "clientes_conferidos"("dia");

ALTER TABLE "clientes_conferidos" ADD CONSTRAINT "clientes_conferidos_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pessoa que sai do sistema não apaga a conferência: ela continua feita, só
-- perde o nome de quem fez.
ALTER TABLE "clientes_conferidos" ADD CONSTRAINT "clientes_conferidos_quemId_fkey"
  FOREIGN KEY ("quemId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
