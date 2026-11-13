-- CreateTable
CREATE TABLE "relatorios_enviados" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quemId" TEXT,

    CONSTRAINT "relatorios_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relatorios_enviados_semana_idx" ON "relatorios_enviados"("semana");

-- CreateIndex
CREATE UNIQUE INDEX "relatorios_enviados_clientId_semana_key" ON "relatorios_enviados"("clientId", "semana");

-- AddForeignKey
ALTER TABLE "relatorios_enviados" ADD CONSTRAINT "relatorios_enviados_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_enviados" ADD CONSTRAINT "relatorios_enviados_quemId_fkey" FOREIGN KEY ("quemId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
