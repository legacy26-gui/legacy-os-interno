-- CRM do comercial: canais, etapas novas do funil e marcos por data.

-- Canal por onde o lead chegou.
CREATE TYPE "LeadChannel" AS ENUM ('META', 'PRESENCIAL', 'REDE', 'MESA_LOJISTA', 'ORGANICO');

-- As etapas antigas viram as novas com o mesmo sentido: quem estava em
-- "Contato" já tinha sido qualificado; quem estava em "Reunião" tinha reunião
-- marcada. Renomear preserva os leads que já estão no quadro.
ALTER TYPE "LeadStage" RENAME VALUE 'CONTATO' TO 'QUALIFICADO';
ALTER TYPE "LeadStage" RENAME VALUE 'REUNIAO' TO 'REUNIAO_AGENDADA';
ALTER TYPE "LeadStage" ADD VALUE 'REUNIAO_REALIZADA' AFTER 'REUNIAO_AGENDADA';

-- Origem antiga passa a ser opcional: o que se preenche agora é o canal.
ALTER TABLE "leads" ALTER COLUMN "origin" DROP NOT NULL;

ALTER TABLE "leads"
  ADD COLUMN "channel" "LeadChannel" NOT NULL DEFAULT 'ORGANICO',
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "qualifiedAt" TIMESTAMP(3),
  ADD COLUMN "meetingSetAt" TIMESTAMP(3),
  ADD COLUMN "meetingHeldAt" TIMESTAMP(3),
  ADD COLUMN "noShowAt" TIMESTAMP(3),
  ADD COLUMN "proposalAt" TIMESTAMP(3),
  ADD COLUMN "wonAt" TIMESTAMP(3),
  ADD COLUMN "lostAt" TIMESTAMP(3),
  ADD COLUMN "lostReason" TEXT,
  ADD COLUMN "monthlyValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "setupValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "contractMonths" INTEGER NOT NULL DEFAULT 12;

-- Traduz a origem antiga pro canal novo.
UPDATE "leads" SET "channel" = CASE
  WHEN "origin" IN ('INSTAGRAM', 'FACEBOOK', 'TRAFEGO_PAGO') THEN 'META'::"LeadChannel"
  WHEN "origin" = 'INDICACAO' THEN 'REDE'::"LeadChannel"
  ELSE 'ORGANICO'::"LeadChannel"
END;

-- Marca os marcos que dá pra deduzir da etapa em que o lead já está, pros
-- números do dashboard não nascerem zerados. Data usada: a da última mexida no
-- lead, que é o mais perto da verdade que temos.
UPDATE "leads" SET "qualifiedAt" = "updatedAt"
  WHERE "stage" <> 'LEAD' AND "stage" <> 'PERDIDO';
UPDATE "leads" SET "meetingSetAt" = "updatedAt"
  WHERE "stage" IN ('REUNIAO_AGENDADA', 'PROPOSTA', 'NEGOCIACAO', 'FECHADO');
UPDATE "leads" SET "proposalAt" = "updatedAt"
  WHERE "stage" IN ('PROPOSTA', 'NEGOCIACAO', 'FECHADO');
UPDATE "leads" SET "wonAt" = "updatedAt" WHERE "stage" = 'FECHADO';
UPDATE "leads" SET "lostAt" = "updatedAt" WHERE "stage" = 'PERDIDO';

CREATE INDEX "leads_stage_position_idx" ON "leads"("stage", "position");
CREATE INDEX "leads_channel_createdAt_idx" ON "leads"("channel", "createdAt");

-- Impressão e verba por canal, mês a mês.
CREATE TABLE "channel_months" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "channel" "LeadChannel" NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "investment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_months_month_channel_key" ON "channel_months"("month", "channel");

-- Venda que veio de um cartão do quadro aponta pro lead: fechar o cartão lança
-- o evento sozinho, sem ninguém ter que digitar a mesma venda de novo.
ALTER TABLE "commercial_events" ADD COLUMN "leadId" TEXT;
CREATE UNIQUE INDEX "commercial_events_leadId_key" ON "commercial_events"("leadId");
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
