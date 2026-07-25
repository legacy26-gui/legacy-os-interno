import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { EventoForm } from "../../../evento-form";
import { updateCommercialEvent } from "@/lib/actions/commercial";

export default async function EditarEventoComercialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("comercial");
  const { id } = await params;
  const event = await prisma.commercialEvent.findUnique({ where: { id } });
  if (!event) notFound();

  const boundUpdate = updateCommercialEvent.bind(null, id);

  return (
    <div className="max-w-2xl">
      <Link href="/comercial" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Voltar para Comercial
      </Link>
      <h1 className="text-xl font-semibold mb-6">Editar evento comercial</h1>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <EventoForm event={event} action={boundUpdate} />
      </div>
    </div>
  );
}
