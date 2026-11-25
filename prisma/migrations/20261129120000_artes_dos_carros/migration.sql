-- O banco de artes: a arte de cada carro (sempre a 1ª foto do anúncio; a proporção dela vale pro anúncio todo).
CREATE TABLE "artes_dos_carros" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "carroId" TEXT,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artes_dos_carros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artes_dos_carros_carroId_key" ON "artes_dos_carros"("carroId");
CREATE INDEX "artes_dos_carros_clientId_criadoEm_idx" ON "artes_dos_carros"("clientId", "criadoEm");

ALTER TABLE "artes_dos_carros" ADD CONSTRAINT "artes_dos_carros_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artes_dos_carros" ADD CONSTRAINT "artes_dos_carros_carroId_fkey" FOREIGN KEY ("carroId") REFERENCES "estoque_carros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
