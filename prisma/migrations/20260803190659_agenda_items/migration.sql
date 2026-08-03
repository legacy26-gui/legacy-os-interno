-- CreateEnum
CREATE TYPE "AgendaItemType" AS ENUM ('AGENDAMENTO', 'REUNIAO', 'TEMPO');

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "AgendaItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_items_ownerId_startAt_idx" ON "agenda_items"("ownerId", "startAt");

-- AddForeignKey
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
