-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "whatsappDesligaAuto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "meta_acoes" ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'sistema',
ADD COLUMN     "pedidoPor" TEXT,
ADD COLUMN     "pedidoTexto" TEXT;
