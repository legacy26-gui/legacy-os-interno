-- O aviso dentro do sistema, e a memória de quando o robô rodou.

-- Até qual gravidade a pessoa já VIU dentro do sistema.
--
-- Separado de "já avisei no celular" de propósito: enquanto o push não
-- estiver configurado, o celular nunca é avisado, e um aviso baseado nisso
-- apareceria na tela pra sempre. Quem zera este aqui é abrir o painel do
-- sininho ou a tela de Alertas.
--
-- Nasce em 0 nas linhas que já existem: na primeira abertura a pessoa vê o
-- que está pendente marcado como novo, que é o certo.
ALTER TABLE "alerta_estados" ADD COLUMN "nivelVisto" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "alerta_estados" ADD COLUMN "vistoEm" TIMESTAMP(3);

-- Quando cada robô rodou pela última vez. A tela mostra ("conferido às
-- 8h03") e a porta do robô usa como acelerador.
CREATE TABLE "robo_execucoes" (
  "nome"    TEXT NOT NULL,
  "rodouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "robo_execucoes_pkey" PRIMARY KEY ("nome")
);
