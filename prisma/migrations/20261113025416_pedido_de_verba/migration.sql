-- CreateTable
CREATE TABLE "pedidos_de_verba" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoPorId" TEXT,
    "saldoNoEnvioCents" INTEGER,
    "entrouEm" TIMESTAMP(3),
    "entrouCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_de_verba_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_de_verba_clientId_enviadoEm_idx" ON "pedidos_de_verba"("clientId", "enviadoEm");

-- AddForeignKey
ALTER TABLE "pedidos_de_verba" ADD CONSTRAINT "pedidos_de_verba_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_de_verba" ADD CONSTRAINT "pedidos_de_verba_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
