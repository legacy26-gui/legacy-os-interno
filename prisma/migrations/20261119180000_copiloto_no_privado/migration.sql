-- A IA atendendo no privado do WhatsApp.
--
-- O telefone de cada pessoa da casa, pra saber de quem é a mensagem, e a
-- memória curta da conversa de cada uma.

ALTER TABLE "users" ADD COLUMN "whatsapp" TEXT;

-- Único: dois colaboradores com o mesmo número fariam a pergunta de um ser
-- respondida com a carteira do outro, e a busca escolheria qual
-- arbitrariamente — o pior tipo de erro, o que acerta quase sempre.
CREATE UNIQUE INDEX "users_whatsapp_key" ON "users"("whatsapp");

CREATE TABLE "conversas_do_copiloto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnos" JSONB NOT NULL DEFAULT '[]',
    "acaoPendente" JSONB,
    "propostaEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversas_do_copiloto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversas_do_copiloto_userId_key" ON "conversas_do_copiloto"("userId");

ALTER TABLE "conversas_do_copiloto"
    ADD CONSTRAINT "conversas_do_copiloto_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
