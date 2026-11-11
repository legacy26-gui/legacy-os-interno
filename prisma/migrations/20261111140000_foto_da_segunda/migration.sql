-- A foto da campanha passa a ser semanal, na conferência de segunda-feira.
--
-- Era cobrada todo dia, na revisão diária. Cobrança diária de foto vira foto
-- repetida só pra fechar o quadrado, e aí o registro deixa de valer como
-- prova de que alguém olhou de verdade.
ALTER TABLE "clientes_conferidos" ADD COLUMN "fotoUrl" TEXT;
