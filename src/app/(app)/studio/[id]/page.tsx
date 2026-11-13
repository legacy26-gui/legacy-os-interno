import { notFound } from "next/navigation";
import { Sparkles, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { Voltar } from "@/components/voltar";
import { precoDaArte, fichaDoVeiculo } from "@/lib/studio/arte";
import { Revisao } from "./revisao";

// Uma arte, nos dois formatos, com os botões de revisão.
//
// ── Por que os dois formatos aparecem juntos ─────────────────────────────
//
// Porque são aprovados juntos. O que estraga uma arte — preço errado, nome
// do carro trocado, foto cortada no lugar errado — pode aparecer só num dos
// recortes: o Stories é mais estreito e come as pontas da foto. Mostrar só
// o feed faria o Stories ir ao ar sem ninguém ter olhado.

export const dynamic = "force-dynamic";

export default async function ArtePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleAccess("studio");
  const { id } = await params;

  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      modelo: true,
      ano: true,
      kmTexto: true,
      precoCents: true,
      chamada: true,
      status: true,
      correcao: true,
      criadoEm: true,
      revisadoEm: true,
      client: { select: { companyName: true, studioMarca: { select: { clientId: true } } } },
      criadoPor: { select: { name: true } },
      revisadoPor: { select: { name: true } },
    },
  });

  if (!arte) notFound();
  // O id vem da URL: a trava é a carteira, como no resto do sistema.
  if (!(await clienteEDaCarteira(user, arte.clientId))) notFound();

  const podeRevisar = user.role === "ADMIN" || user.role === "GERENTE";
  const ficha = fichaDoVeiculo(arte.ano, arte.kmTexto);
  const preco = precoDaArte(arte.precoCents);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <Voltar href="/studio">Legacy Studio</Voltar>
        <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
          <Sparkles size={20} className="text-accent" /> {arte.modelo}
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          {arte.client.companyName}
          {ficha && ` · ${ficha}`}
          {preco && ` · ${preco}`}
        </p>
      </div>

      {arte.status === "CORRIGIR" && arte.correcao && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              <strong>Correção pedida</strong>
              {arte.revisadoPor?.name && ` por ${arte.revisadoPor.name.split(" ")[0]}`}:{" "}
              <span className="font-normal">{arte.correcao}</span>
            </span>
          </p>
        </div>
      )}

      {arte.status === "APROVADO" && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Aprovada
          {arte.revisadoPor?.name && ` por ${arte.revisadoPor.name.split(" ")[0]}`}
          {arte.revisadoEm &&
            ` em ${arte.revisadoEm.toLocaleDateString("pt-BR")} às ${arte.revisadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          .
        </p>
      )}

      {!arte.client.studioMarca && (
        <p className="text-xs text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          Esta loja não tem identidade visual cadastrada, então a arte saiu sem logo e com as
          cores padrão. Cadastrando a marca, esta mesma peça passa a sair com a cara da loja —
          sem precisar refazer nada.
        </p>
      )}

      <Revisao id={arte.id} status={arte.status} podeRevisar={podeRevisar} />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-start">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Feed · 1080 × 1080
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/studio/arte/${arte.id}?formato=feed`}
            alt={`Arte de feed de ${arte.modelo}`}
            className="w-full rounded-xl border border-border bg-black"
          />
        </figure>

        <figure className="flex flex-col gap-2 md:w-64">
          <figcaption className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Stories · 1080 × 1920
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/studio/arte/${arte.id}?formato=story`}
            alt={`Arte de Stories de ${arte.modelo}`}
            className="w-full rounded-xl border border-border bg-black"
          />
        </figure>
      </div>

      <p className="text-xs text-foreground-muted">
        Criada
        {arte.criadoPor?.name && ` por ${arte.criadoPor.name.split(" ")[0]}`} em{" "}
        {arte.criadoEm.toLocaleDateString("pt-BR")}. As duas peças são desenhadas na hora a partir
        da foto e dos dados — trocar a logo da loja atualiza todas as artes dela de uma vez.
      </p>
    </div>
  );
}
