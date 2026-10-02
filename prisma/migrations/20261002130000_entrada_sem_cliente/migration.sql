-- Entrada de dinheiro sem cliente na carteira passa a ser possível.
--
-- O Treinamentos vende curso — avulso, parcelado, assinatura, low ticket — e
-- não tem loja com mensalidade na tabela de clientes. Sem isso, o financeiro
-- do Treinamentos não conseguiria lançar uma única entrada. Nesses casos quem
-- identifica a entrada é a descrição.
--
-- Nada muda pro que já existe: toda receita atual tem cliente e continua tendo.
ALTER TABLE "revenues" ALTER COLUMN "clientId" DROP NOT NULL;
