-- Histórico de visitas: cada dia em que alguém visitou a loja, e o que foi falado.
CREATE TABLE "visitas_da_loja" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "nota" TEXT,
    "quemId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitas_da_loja_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visitas_da_loja_clientId_dia_key" ON "visitas_da_loja"("clientId", "dia");
CREATE INDEX "visitas_da_loja_clientId_dia_idx" ON "visitas_da_loja"("clientId", "dia");

ALTER TABLE "visitas_da_loja" ADD CONSTRAINT "visitas_da_loja_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitas_da_loja" ADD CONSTRAINT "visitas_da_loja_quemId_fkey" FOREIGN KEY ("quemId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A última visita que já estava marcada vira a primeira linha do histórico (o que veio antes não foi guardado).
INSERT INTO "visitas_da_loja" ("id", "clientId", "dia")
SELECT gen_random_uuid()::text, "id", ("ultimaVisitaEm" AT TIME ZONE 'UTC')::date
FROM "clients"
WHERE "ultimaVisitaEm" IS NOT NULL
ON CONFLICT DO NOTHING;
