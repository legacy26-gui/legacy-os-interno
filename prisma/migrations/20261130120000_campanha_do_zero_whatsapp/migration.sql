-- Campanha do zero pelo WhatsApp: o pedido em montagem/criação (um por pessoa) e os vídeos dos carros.
CREATE TABLE "campanhas_do_zero_whatsapp" (
    "userId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "pedido" JSONB NOT NULL,
    "andamento" JSONB,
    "venceEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campanhas_do_zero_whatsapp_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "videos_do_zero" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "carroId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "videos_do_zero_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "videos_do_zero_userId_idx" ON "videos_do_zero"("userId");
