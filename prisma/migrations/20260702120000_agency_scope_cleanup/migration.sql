-- Remove escopo de revenda/CRM de veículos (Áquila IA) e adiciona Suporte aos clientes

-- Safety: remove any contracts/templates still using the retired AQUILA_IA type
-- before narrowing the enum, in case the initial seed already ran.
DELETE FROM "contracts" WHERE "templateId" IN (
  SELECT "id" FROM "contract_templates" WHERE "type" = 'AQUILA_IA'
);
DELETE FROM "contract_templates" WHERE "type" = 'AQUILA_IA';

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO');

-- AlterEnum
BEGIN;
CREATE TYPE "ContractTemplateType_new" AS ENUM ('TRAFEGO_PAGO', 'SITE', 'GESTAO_COMPLETA', 'OUTRO');
ALTER TABLE "contract_templates" ALTER COLUMN "type" TYPE "ContractTemplateType_new" USING ("type"::text::"ContractTemplateType_new");
ALTER TYPE "ContractTemplateType" RENAME TO "ContractTemplateType_old";
ALTER TYPE "ContractTemplateType_new" RENAME TO "ContractTemplateType";
DROP TYPE "public"."ContractTemplateType_old";
COMMIT;

-- DropTable
DROP TABLE "aquila_metrics";

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
    "status" "TicketStatus" NOT NULL DEFAULT 'ABERTO',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
