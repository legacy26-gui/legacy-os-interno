-- Memória dos alertas.
--
-- O alerta em si não é gravado: ele é calculado a partir do que já existe no
-- banco (gravação sem baixa, venda antiga, mensalidade vencida, ficha parada).
-- Assim ele nasce com o problema e some quando o problema é resolvido, sem
-- ninguém precisar dar baixa — e não existe alerta fantasma.
--
-- Esta tabela guarda só o que o banco não saberia sozinho: até qual gravidade
-- cada pessoa já foi avisada no celular, e o que ela pediu pra lembrar depois.

CREATE TABLE "alerta_estados" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "chave"         TEXT NOT NULL,
  "nivelAvisado"  INTEGER NOT NULL DEFAULT 0,
  "avisadoEm"     TIMESTAMP(3),
  "silenciadoAte" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alerta_estados_pkey" PRIMARY KEY ("id")
);

-- Uma linha por pessoa por alerta: rodar o robô duas vezes não duplica.
CREATE UNIQUE INDEX "alerta_estados_userId_chave_key" ON "alerta_estados"("userId", "chave");

CREATE INDEX "alerta_estados_userId_idx" ON "alerta_estados"("userId");

-- Pessoa que sai do sistema leva a memória dos alertas dela junto: não serve
-- pra mais nada e não é dado de ninguém além dela.
ALTER TABLE "alerta_estados" ADD CONSTRAINT "alerta_estados_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
