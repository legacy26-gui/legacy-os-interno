-- Venda por lead, registrada pelo robô a partir do aviso no grupo da loja.

-- De onde veio o lançamento, e quais anúncios eram do carro. Sem isso a venda do
-- robô ficaria sem dono (ninguém poderia desfazer) e o mesmo carro poderia ser
-- registrado duas vezes.
ALTER TABLE "client_sales" ADD COLUMN "origem" TEXT;
ALTER TABLE "client_sales" ADD COLUMN "anuncioIds" TEXT;

-- A venda que o robô entendeu mas ainda espera valor ou origem. Uma por grupo.
CREATE TABLE "vendas_aguardando_dados" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "carro" TEXT NOT NULL,
    "anuncioIds" TEXT NOT NULL,
    "valorCents" INTEGER,
    "origemLead" BOOLEAN,
    "precoDoAnuncioCents" INTEGER,
    "textoOriginal" TEXT NOT NULL,
    "quem" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendas_aguardando_dados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendas_aguardando_dados_grupoId_key" ON "vendas_aguardando_dados"("grupoId");

ALTER TABLE "vendas_aguardando_dados"
    ADD CONSTRAINT "vendas_aguardando_dados_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
