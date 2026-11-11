-- Quantos aparelhos receberam o aviso da reunião.
--
-- A confirmação na tela some quando a página se atualiza, e aí ninguém mais
-- saberia se o celular tocou. Com o push desligado isso daria uma reunião
-- "avisada" que não avisou ninguém — pior do que não ter o botão.
ALTER TABLE "acoes_de_resgate" ADD COLUMN "avisados" INTEGER NOT NULL DEFAULT 0;
