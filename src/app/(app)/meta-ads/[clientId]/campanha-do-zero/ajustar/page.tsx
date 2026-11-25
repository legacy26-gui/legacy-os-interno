import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { Ajustador } from "./ajustador";

// Ajustar uma campanha já criada: mover carro de conjunto, renomear, orçamento, conjunto novo, excluir anúncio.
// Ver src/lib/meta/ajustar-campanha.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function AjustarPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ conta?: string; campanha?: string }> }) {
  const user = await requireModuleAccess("clientes");
  const { clientId } = await params;
  const q = await searchParams;
  if (!(await clienteEDaCarteira(user, clientId))) notFound();
  const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true } });
  const contas = await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { metaAccountId: true, name: true } });
  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <Link href={`/meta-ads/${clientId}/campanha-do-zero`} className="text-sm text-foreground-muted inline-flex items-center gap-1.5 hover:text-foreground w-fit">
        <ArrowLeft size={14} /> Campanha do zero
      </Link>
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Wrench size={20} /> Ajustar campanha — {loja?.companyName}
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Errou algo na hora de subir? Mova o carro pro conjunto certo (arraste ou escolha), troque nomes e orçamento, crie conjunto, exclua anúncio. Só mexe no
          que está <strong>pausado</strong>; nada é ligado.
        </p>
      </div>
      {contas.length === 0 ? (
        <p className="text-sm text-amber-600">Esta loja não tem conta de anúncio ligada.</p>
      ) : (
        <Ajustador
          clientId={clientId}
          contas={contas.map((c) => ({ id: c.metaAccountId, nome: c.name ?? c.metaAccountId }))}
          contaInicial={contas.some((c) => c.metaAccountId === q.conta) ? (q.conta as string) : contas[0].metaAccountId}
          campanhaInicial={q.campanha && /^\d{5,25}$/.test(q.campanha) ? q.campanha : null}
        />
      )}
    </div>
  );
}
