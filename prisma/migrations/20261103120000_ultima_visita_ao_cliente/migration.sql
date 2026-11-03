-- Último dia em que alguém da casa foi na loja.
--
-- Guarda só a data, não o histórico: o que a equipe precisa saber é há quanto
-- tempo não se aparece lá. Nasce vazio em todo mundo — vazio quer dizer "nunca
-- registrou visita", que não é o mesmo que "nunca foi".
ALTER TABLE "clients" ADD COLUMN "ultimaVisitaEm" TIMESTAMP(3);
