import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/dal";
import { PlaybookForm } from "../playbook-form";
import { createPlaybook } from "@/lib/actions/playbooks";

export default async function NovoPlaybookPage() {
  const user = await requireModuleAccess("playbooks");
  if (user.role === "GESTOR_TRAFEGO") redirect("/playbooks?erro=acesso-negado");

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Novo Playbook</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <PlaybookForm action={createPlaybook} />
      </div>
    </div>
  );
}
