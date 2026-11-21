-- Rascunho de anúncio: lojas "um carro por conjunto" duplicam o conjunto molde.
ALTER TABLE "padrao_de_rascunho" ADD COLUMN "duplicarConjunto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "padrao_de_rascunho" ADD COLUMN "orcamentoCents" INTEGER;
ALTER TABLE "rascunhos_whatsapp" ADD COLUMN "duplicarConjunto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rascunhos_whatsapp" ADD COLUMN "orcamentoCents" INTEGER;
ALTER TABLE "rascunhos_whatsapp" ADD COLUMN "conjuntoCriadoId" TEXT;
