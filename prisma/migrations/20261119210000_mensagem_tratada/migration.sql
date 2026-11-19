-- A trava contra o reenvio da Z-API.
--
-- Ela reenvia o webhook quando não recebe resposta rápido, e atender uma
-- pergunta da IA leva dezenas de segundos. Resultado: a mesma mensagem
-- atendida duas vezes — resposta repetida no privado, anúncio desligado duas
-- vezes no grupo.
--
-- Quem chega primeiro cria a linha; quem chega depois esbarra na chave
-- primária e vai embora. Quem decide é o banco, não o código.

CREATE TABLE "mensagens_tratadas" (
    "messageId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_tratadas_pkey" PRIMARY KEY ("messageId")
);

CREATE INDEX "mensagens_tratadas_criadoEm_idx" ON "mensagens_tratadas"("criadoEm");
