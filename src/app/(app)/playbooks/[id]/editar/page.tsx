import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { PlaybookForm } from "../../playbook-form";
import { updatePlaybook } from "@/lib/actions/playbooks";

export default async function EditarPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleAccess("playbooks");
  if (user.role === "GESTOR_TRAFEGO") redirect("/playbooks?erro=acesso-negado");

  const { id } = await params;
  const playbook = await prisma.playbook.findUnique({ where: { id } });
  if (!playbook) notFound();

  const boundUpdate = updatePlaybook.bind(null, id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Editar Playbook</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <PlaybookForm playbook={playbook} action={boundUpdate} />
      </div>
    </div>
  );
}
