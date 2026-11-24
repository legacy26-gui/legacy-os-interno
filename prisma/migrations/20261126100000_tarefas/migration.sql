-- Tarefas pessoais (únicas e recorrentes), com aviso de manhã e pergunta às 17h pelo WhatsApp.
CREATE TYPE "RecorrenciaDaTarefa" AS ENUM ('NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL');

CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "criadaPorId" TEXT,
    "recorrencia" "RecorrenciaDaTarefa" NOT NULL DEFAULT 'NENHUMA',
    "prazo" DATE,
    "diaDaSemana" INTEGER,
    "diaDoMes" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "origem" TEXT NOT NULL DEFAULT 'sistema',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tarefas_feitas" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "feitaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feitaPorId" TEXT,

    CONSTRAINT "tarefas_feitas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "avisos_de_tarefa_enviados" (
    "userId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_de_tarefa_enviados_pkey" PRIMARY KEY ("userId","dia","tipo")
);

CREATE INDEX "tarefas_responsavelId_ativa_idx" ON "tarefas"("responsavelId", "ativa");
CREATE UNIQUE INDEX "tarefas_feitas_tarefaId_dia_key" ON "tarefas_feitas"("tarefaId", "dia");

ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tarefas_feitas" ADD CONSTRAINT "tarefas_feitas_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
