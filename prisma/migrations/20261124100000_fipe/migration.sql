-- Tabela FIPE dos carros do estoque (inteligência comercial) e o cache das consultas.
ALTER TABLE "estoque_carros" ADD COLUMN "fipeTipo" TEXT;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeCents" INTEGER;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeMaxCents" INTEGER;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeModelo" TEXT;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeCodigo" TEXT;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeReferencia" TEXT;
ALTER TABLE "estoque_carros" ADD COLUMN "fipeConferidoEm" TIMESTAMP(3);

CREATE TABLE "fipe_cache" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "buscadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fipe_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fipe_cache_chave_key" ON "fipe_cache"("chave");
