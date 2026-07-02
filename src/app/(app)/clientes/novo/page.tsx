import { requireModuleAccess } from "@/lib/dal";
import { ClientForm } from "../client-form";
import { createClient } from "@/lib/actions/clients";

export default async function NovoClientePage() {
  await requireModuleAccess("clientes");

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Novo Cliente</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ClientForm action={createClient} />
      </div>
    </div>
  );
}
