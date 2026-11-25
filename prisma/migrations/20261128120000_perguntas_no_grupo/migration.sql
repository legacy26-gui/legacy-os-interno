-- A pergunta que o robô deixou aberta no grupo da loja ("qual desses eu tiro do ar?" / "confirma?"), pra a resposta seguinte
-- escolher SÓ dentro daquela lista. Uma por grupo; a mais nova substitui a anterior.
CREATE TABLE "perguntas_no_grupo" (
    "grupoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quem" TEXT,
    "tipo" TEXT NOT NULL,
    "candidatos" JSONB NOT NULL,
    "feitaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perguntas_no_grupo_pkey" PRIMARY KEY ("grupoId")
);
