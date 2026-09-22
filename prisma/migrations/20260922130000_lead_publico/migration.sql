-- Formulário público da landing: UF do lead e controle de envios por IP.

-- Quem vem da landing informa o estado; sem isso a cidade fica ambígua.
ALTER TABLE "leads" ADD COLUMN "state" TEXT;

-- Uma linha por envio do formulário. Só serve pro limite por IP, por isso não
-- guarda nada do lead. Linha com mais de um dia é apagada pela própria rota.
CREATE TABLE "tentativas_lead" (
  "id" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tentativas_lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentativas_lead_ip_createdAt_idx" ON "tentativas_lead"("ip", "createdAt");
