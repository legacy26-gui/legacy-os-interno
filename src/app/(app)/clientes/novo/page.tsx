import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { ClientForm } from "../client-form";
import { createClient } from "@/lib/actions/clients";

export default async function NovoClientePage() {
  const user = await requireModuleAccess("clientes");

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Novo Cliente</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ClientForm action={createClient} canSeeValues={canAccessModule(user.role, "financeiro")} />
      </div>
    </div>
  );
}
