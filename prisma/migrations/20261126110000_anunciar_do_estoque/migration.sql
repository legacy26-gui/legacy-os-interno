-- "Anunciar agora" a partir do estoque: o aviso de carro novo já mandado e o rascunho já criado, por carro.
ALTER TABLE "estoque_carros" ADD COLUMN "avisoNovoEm" TIMESTAMP(3),
ADD COLUMN "rascunhoAdId" TEXT,
ADD COLUMN "rascunhoEm" TIMESTAMP(3);
