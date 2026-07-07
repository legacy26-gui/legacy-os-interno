-- Gestor responsável pelo cliente (operador da carteira)

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "managerId" TEXT;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
