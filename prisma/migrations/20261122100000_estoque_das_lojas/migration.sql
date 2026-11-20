-- Estoque das lojas, lido do site (AutoCerto): serve à inteligência comercial.
CREATE TABLE "estoque_da_loja" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "sistema" TEXT NOT NULL DEFAULT 'autocerto',
    "ultimaLeituraEm" TIMESTAMP(3),
    "ultimoTotal" INTEGER,
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "estoque_da_loja_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "estoque_da_loja_clientId_key" ON "estoque_da_loja"("clientId");
ALTER TABLE "estoque_da_loja" ADD CONSTRAINT "estoque_da_loja_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "estoque_carros" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "versao" TEXT,
    "anoModelo" INTEGER,
    "anoFabricacao" INTEGER,
    "cor" TEXT,
    "km" INTEGER,
    "precoCents" INTEGER,
    "url" TEXT NOT NULL,
    "foto" TEXT,
    "primeiraVezEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVezEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sumiuEm" TIMESTAMP(3),
    "detalheEm" TIMESTAMP(3),
    CONSTRAINT "estoque_carros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "estoque_carros_clientId_codigo_key" ON "estoque_carros"("clientId", "codigo");
CREATE INDEX "estoque_carros_clientId_sumiuEm_idx" ON "estoque_carros"("clientId", "sumiuEm");
ALTER TABLE "estoque_carros" ADD CONSTRAINT "estoque_carros_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "estoque_precos" (
    "id" TEXT NOT NULL,
    "carroId" TEXT NOT NULL,
    "precoCents" INTEGER NOT NULL,
    "vistoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "estoque_precos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "estoque_precos_carroId_vistoEm_idx" ON "estoque_precos"("carroId", "vistoEm");
ALTER TABLE "estoque_precos" ADD CONSTRAINT "estoque_precos_carroId_fkey" FOREIGN KEY ("carroId") REFERENCES "estoque_carros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
