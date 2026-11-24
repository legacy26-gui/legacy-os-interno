-- Uso da IA: uma linha por chamada (função, modelo, tokens), pra saber quanto cada coisa do sistema gasta.
CREATE TABLE "uso_da_ia" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "funcao" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "entrada" INTEGER NOT NULL DEFAULT 0,
    "cacheados" INTEGER NOT NULL DEFAULT 0,
    "saida" INTEGER NOT NULL DEFAULT 0,
    "raciocinio" INTEGER NOT NULL DEFAULT 0,
    "segundosDeAudio" INTEGER,
    "ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "uso_da_ia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "uso_da_ia_quando_idx" ON "uso_da_ia"("quando");
