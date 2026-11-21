-- Subir anúncio pelo WhatsApp: a conversa em andamento, as fotos recebidas e o "mesmo de sempre" de cada loja.
CREATE TABLE "rascunhos_whatsapp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "clientId" TEXT,
    "lojaNome" TEXT,
    "adsetId" TEXT,
    "adsetNome" TEXT,
    "campanhaNome" TEXT,
    "baseAdId" TEXT,
    "baseNome" TEXT,
    "base" JSONB,
    "carro" TEXT,
    "nome" TEXT,
    "titulo" TEXT,
    "legenda" TEXT,
    "avisosDaLegenda" JSONB,
    "opcoes" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "venceEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rascunhos_whatsapp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rascunhos_whatsapp_userId_key" ON "rascunhos_whatsapp"("userId");

CREATE TABLE "rascunho_fotos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rascunho_fotos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rascunho_fotos_messageId_key" ON "rascunho_fotos"("messageId");
CREATE INDEX "rascunho_fotos_userId_criadoEm_idx" ON "rascunho_fotos"("userId", "criadoEm");

CREATE TABLE "padrao_de_rascunho" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "baseAdId" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "padrao_de_rascunho_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "padrao_de_rascunho_clientId_key" ON "padrao_de_rascunho"("clientId");
