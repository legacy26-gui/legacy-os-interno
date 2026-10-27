-- Gravação de vídeo: a ida à loja, a hora e quantos vídeos saíram dali.
--
-- O controle disso vivia na cabeça de quem gravou. O que a equipe precisa
-- responder é: o que foi gravado hoje, quantos vídeos, e o que vence pra
-- entregar amanhã — o prazo da casa é D+1.

CREATE TABLE "gravacoes" (
  "id"         TEXT NOT NULL,
  "empresa"    "Empresa" NOT NULL DEFAULT 'AGENCIA',
  "clientId"   TEXT,
  -- Nome da loja guardado aqui mesmo com cliente vinculado: se o cliente for
  -- renomeado ou sair da carteira, a gravação continua dizendo pra quem foi.
  "loja"       TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL DEFAULT 1,
  "gravadoEm"  TIMESTAMP(3) NOT NULL,
  "entregaEm"  TIMESTAMP(3) NOT NULL,
  "entregueEm" TIMESTAMP(3),
  "observacao" TEXT,
  "ownerId"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gravacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gravacoes_empresa_gravadoEm_idx" ON "gravacoes"("empresa", "gravadoEm");
CREATE INDEX "gravacoes_empresa_entregaEm_idx" ON "gravacoes"("empresa", "entregaEm");

-- Cliente apagado não apaga a gravação: ela é histórico do que a equipe fez,
-- e o nome da loja está na própria linha.
ALTER TABLE "gravacoes" ADD CONSTRAINT "gravacoes_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gravacoes" ADD CONSTRAINT "gravacoes_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
