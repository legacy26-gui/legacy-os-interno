import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { EventoForm } from "../../evento-form";
import { createCommercialEvent } from "@/lib/actions/commercial";

export default async function NovoEventoComercialPage() {
  await requireModuleAccess("comercial");

  return (
    <div className="max-w-2xl">
      <Link href="/comercial" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Voltar para Comercial
      </Link>
      <h1 className="text-xl font-semibold mb-6">Adicionar venda ou churn manualmente</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <EventoForm action={createCommercialEvent} />
      </div>
    </div>
  );
}
