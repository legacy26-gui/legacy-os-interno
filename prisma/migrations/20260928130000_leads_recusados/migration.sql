-- Caixa preta do formulário público: o que chegou e não virou lead.
CREATE TABLE "leads_recusados" (
  "id" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "origem" TEXT,
  "ip" TEXT,
  "corpo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_recusados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_recusados_createdAt_idx" ON "leads_recusados"("createdAt");
