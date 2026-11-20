-- A trilha do robô de WhatsApp: uma linha por decisão.
CREATE TABLE "passo_do_robo" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT,
    "de" TEXT,
    "passo" TEXT NOT NULL,
    "detalhe" TEXT,
    CONSTRAINT "passo_do_robo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "passo_do_robo_quando_idx" ON "passo_do_robo"("quando");
CREATE INDEX "passo_do_robo_messageId_idx" ON "passo_do_robo"("messageId");
