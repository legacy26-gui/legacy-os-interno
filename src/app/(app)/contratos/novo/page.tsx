import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { ContractForm } from "./contract-form";

export default async function NovoContratoPage() {
  await requireModuleAccess("contratos");

  const [clients, templates] = await Promise.all([
    prisma.client.findMany({ select: { id: true, companyName: true, monthlyValue: true }, orderBy: { companyName: "asc" } }),
    prisma.contractTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Novo Contrato</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ContractForm
          clients={clients.map((c) => ({ ...c, monthlyValue: c.monthlyValue.toString() }))}
          templates={templates}
        />
      </div>
    </div>
  );
}
