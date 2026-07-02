import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatDate } from "@/lib/labels";
import { PrintButton } from "@/app/relatorios/[id]/imprimir/print-button";

export default async function ImprimirContratoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("contratos");
  const { id } = await params;

  const contract = await prisma.contract.findUnique({ where: { id }, include: { client: true, template: true } });
  if (!contract) notFound();

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-6 mb-6 print:hidden">
        <PrintButton />
      </div>

      <div className="flex items-center justify-between mb-10">
        <p className="text-2xl font-black tracking-tight">
          LEGACY<span className="text-indigo-600">DIGITAL</span>
        </p>
        <div className="text-right text-sm text-zinc-500">
          <p>{contract.template.name}</p>
          <p>{formatDate(contract.createdAt)}</p>
        </div>
      </div>

      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{contract.content}</pre>

      <p className="text-xs text-zinc-400 mt-16 border-t border-zinc-200 pt-4">
        Legacy Digital © 2026 — Documento gerado automaticamente pelo Legacy OS.
      </p>
    </div>
  );
}
