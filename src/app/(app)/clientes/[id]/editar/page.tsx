import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { ClientForm } from "../../client-form";
import { updateClient } from "@/lib/actions/clients";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleAccess("clientes");
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const boundUpdate = updateClient.bind(null, id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Editar Cliente</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ClientForm client={client} action={boundUpdate} canSeeValues={canAccessModule(user.role, "financeiro")} />
      </div>
    </div>
  );
}
