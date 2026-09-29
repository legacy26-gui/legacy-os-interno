-- Tirar da cobrança passa a valer só pro mês escolhido.

CREATE TABLE "cobrancas_puladas" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cobrancas_puladas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cobrancas_puladas_clientId_month_key" ON "cobrancas_puladas"("clientId", "month");
CREATE INDEX "cobrancas_puladas_month_idx" ON "cobrancas_puladas"("month");

ALTER TABLE "cobrancas_puladas" ADD CONSTRAINT "cobrancas_puladas_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quem estava fora da cobrança de forma permanente vira "pulado neste mês".
-- É o comportamento que se quer daqui pra frente: no mês que vem ele volta.
INSERT INTO "cobrancas_puladas" ("id", "clientId", "month")
SELECT gen_random_uuid()::text, "id", to_char(CURRENT_DATE, 'YYYY-MM')
FROM "clients" WHERE "billingActive" = false;

-- A coluna deixa de mandar na cobrança; zerada pra não confundir quem ler.
UPDATE "clients" SET "billingActive" = true WHERE "billingActive" = false;
