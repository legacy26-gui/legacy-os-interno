-- Os grupos onde a IA pode responder pergunta da equipe.
--
-- Lista explícita e não um sim-ou-não: se ela respondesse em qualquer grupo,
-- bastaria alguém perguntar "quais lojas estão sem verba?" no grupo de um
-- cliente pra ela listar as lojas dos OUTROS clientes ali dentro.

CREATE TABLE "grupos_internos" (
    "grupoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_internos_pkey" PRIMARY KEY ("grupoId")
);
