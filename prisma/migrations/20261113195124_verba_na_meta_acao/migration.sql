-- AlterTable
ALTER TABLE "meta_acoes" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'status',
ADD COLUMN     "valorAntesCents" INTEGER,
ADD COLUMN     "valorPedidoCents" INTEGER;
