-- A verba de anúncio passa a ser por empresa.
--
-- As duas anunciam no mesmo canal no mesmo mês. Somar as duas numa linha só
-- faria o CPL, o custo por reunião e o CAC de cada uma sair errado.
ALTER TABLE "channel_months" ADD COLUMN "empresa" "Empresa" NOT NULL DEFAULT 'AGENCIA';

DROP INDEX IF EXISTS "channel_months_month_channel_key";
CREATE UNIQUE INDEX "channel_months_empresa_month_channel_key"
  ON "channel_months"("empresa", "month", "channel");
