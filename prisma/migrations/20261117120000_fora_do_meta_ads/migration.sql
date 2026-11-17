-- Tirar uma loja do acompanhamento do Meta Ads sem apagar nada.
--
-- Não é cancelamento nem desvínculo: ela continua cliente, continua no
-- Financeiro, e os números já buscados continuam aqui. Só some das telas e
-- dos alertas do Meta Ads, e volta num clique.
ALTER TABLE "clients" ADD COLUMN "foraDoMetaAds" BOOLEAN NOT NULL DEFAULT false;
