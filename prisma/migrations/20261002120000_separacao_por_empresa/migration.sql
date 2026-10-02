-- O grupo passa a ter duas empresas: a agência (Legacy Automotivo) e o
-- Legacy Treinamentos. O sistema é o mesmo; o que muda é de quem é o dinheiro,
-- o funil e a meta.
--
-- Tudo que já existe é da agência — por isso o default AGENCIA e o backfill
-- abaixo. Nada muda de lugar nem de valor pra quem já usava o sistema.

CREATE TYPE "Empresa" AS ENUM ('AGENCIA', 'TREINAMENTOS');

-- Em quais empresas cada pessoa trabalha. Quem tem as duas vê o grupo inteiro;
-- quem tem uma só nem sabe que a outra existe. É array porque o Guilherme
-- precisa das duas e o sócio do treinamentos, de uma.
ALTER TABLE "users" ADD COLUMN "empresas" "Empresa"[] NOT NULL DEFAULT ARRAY['AGENCIA']::"Empresa"[];

-- Quem é administrador manda no grupo inteiro, então já nasce com as duas.
-- O resto da equipe fica só na agência até alguém liberar o treinamentos.
UPDATE "users" SET "empresas" = ARRAY['AGENCIA', 'TREINAMENTOS']::"Empresa"[] WHERE "role" = 'ADMIN';

-- Dinheiro
ALTER TABLE "revenues"        ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';
ALTER TABLE "expenses"        ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';
ALTER TABLE "fixed_expenses"  ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';
ALTER TABLE "cash_settings"   ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';
ALTER TABLE "monthly_goals"   ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';

-- Funil
ALTER TABLE "leads"             ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';
ALTER TABLE "commercial_events" ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';

-- Saldo inicial é um por empresa: o caixa do treinamentos não começa com o
-- dinheiro da agência.
CREATE UNIQUE INDEX "cash_settings_empresa_key" ON "cash_settings"("empresa");

-- A meta deixa de ser única por mês e passa a ser única por empresa + mês: a
-- agência pode querer 50 mil em outubro e o treinamentos 12 mil, e as duas
-- linhas convivem.
DROP INDEX IF EXISTS "monthly_goals_month_key";
CREATE UNIQUE INDEX "monthly_goals_empresa_month_key" ON "monthly_goals"("empresa", "month");

-- Os índices de consulta passam a começar pela empresa, porque toda tela
-- filtra por ela antes de qualquer outra coisa.
DROP INDEX IF EXISTS "expenses_date_paid_idx";
CREATE INDEX "expenses_empresa_date_paid_idx" ON "expenses"("empresa", "date", "paid");

DROP INDEX IF EXISTS "leads_stage_position_idx";
CREATE INDEX "leads_empresa_stage_position_idx" ON "leads"("empresa", "stage", "position");

DROP INDEX IF EXISTS "leads_channel_createdAt_idx";
CREATE INDEX "leads_empresa_channel_createdAt_idx" ON "leads"("empresa", "channel", "createdAt");

DROP INDEX IF EXISTS "commercial_events_type_createdAt_idx";
CREATE INDEX "commercial_events_empresa_type_createdAt_idx" ON "commercial_events"("empresa", "type", "createdAt");
