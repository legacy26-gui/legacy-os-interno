-- Um grupo de WhatsApp serve a UMA loja, e agora o banco garante isso.
--
-- A regra já era conferida ao salvar pela tela, mas só ali. Com duas linhas
-- carregando o mesmo grupo, quem procura "de qual loja é este grupo" recebe
-- uma delas, a que o banco devolver primeiro — e o robô desligaria o anúncio
-- de uma loja por pedido de outra.
--
-- Nulo não entra em índice único no Postgres, então loja sem grupo continua
-- podendo ser quantas forem.
CREATE UNIQUE INDEX "clients_whatsappGrupoId_key" ON "clients"("whatsappGrupoId");
