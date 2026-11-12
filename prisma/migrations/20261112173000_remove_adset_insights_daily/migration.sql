-- A tabela antiga de insights por CONJUNTO sai: virou meta_insights_daily,
-- por anúncio. Era cache da Meta, não dado nosso — o robô da noite reenche.
--
-- Em migration PRÓPRIA e com lock_timeout de propósito.
--
-- DROP TABLE precisa de trava exclusiva. Se alguém estiver lendo a tabela
-- naquele instante, o Postgres não falha: ele ESPERA, sem prazo. A
-- implantação fica pendurada, sem erro e sem fim, e ninguém entende por quê.
--
-- Com o limite, ou pega a trava em 5 segundos ou falha alto. E, separada da
-- anterior, se falhar as tabelas novas já estão de pé: o sistema funciona, e
-- a limpeza tenta de novo no próximo deploy.
SET lock_timeout = '5s';

DROP TABLE IF EXISTS "adset_insights_daily" CASCADE;
