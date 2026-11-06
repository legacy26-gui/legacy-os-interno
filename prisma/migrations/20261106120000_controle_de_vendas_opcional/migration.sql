-- Permite tirar um cliente do Controle de Vendas.
--
-- Nem todo cliente é loja de carro: consórcio, banco e afins não têm "carro
-- vendido" pra cobrar, e ficavam no vermelho pra sempre poluindo a tela.
--
-- Nasce true em todo mundo: nada muda até alguém tirar alguém na mão. Tirar
-- do controle não mexe em mais nada do cliente.
ALTER TABLE "clients" ADD COLUMN "controlaVendas" BOOLEAN NOT NULL DEFAULT true;
