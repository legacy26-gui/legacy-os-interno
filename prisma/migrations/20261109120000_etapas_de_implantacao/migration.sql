-- Controle das etapas de implantação de um cliente novo.
--
-- Só grava o que FOI feito: a lista das etapas possíveis mora no código
-- (src/lib/etapas-implantacao.ts). Assim mexer na lista — tirar, acrescentar,
-- renomear — não exige migração nem mexe em ficha nenhuma, e a marcação
-- antiga continua guardada caso a etapa volte pra lista.

CREATE TABLE "onboarding_etapas" (
  "id"             TEXT NOT NULL,
  "onboardingId"   TEXT NOT NULL,
  "chave"          TEXT NOT NULL,
  "concluidoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidoPorId" TEXT,
  "observacao"     TEXT,
  CONSTRAINT "onboarding_etapas_pkey" PRIMARY KEY ("id")
);

-- Uma marcação por etapa por ficha: clicar duas vezes não duplica.
CREATE UNIQUE INDEX "onboarding_etapas_onboardingId_chave_key"
  ON "onboarding_etapas"("onboardingId", "chave");

-- Apagar a ficha leva as etapas dela junto.
ALTER TABLE "onboarding_etapas" ADD CONSTRAINT "onboarding_etapas_onboardingId_fkey"
  FOREIGN KEY ("onboardingId") REFERENCES "client_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pessoa que sai do sistema não apaga a etapa: ela continua feita, só perde
-- o nome de quem fez.
ALTER TABLE "onboarding_etapas" ADD CONSTRAINT "onboarding_etapas_concluidoPorId_fkey"
  FOREIGN KEY ("concluidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
