import Link from "next/link";
import { ArrowLeft, Rocket } from "lucide-react";
import { prepararCampanhaDoZero, listarPaginas } from "@/lib/actions/campanha-do-zero";
import { FormularioDoZero } from "./formulario";

// Campanha do zero pra loja nova: campanha → conjunto(s) → um anúncio por carro do estoque, tudo PAUSADO, destino WhatsApp.
// Ver src/lib/meta/campanha-do-zero.ts.

export const dynamic = "force-dynamic";
// Cada carro baixa as fotos do site e sobe na Meta: pode passar de um minuto.
export const maxDuration = 300;

export default async function CampanhaDoZeroPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const dados = await prepararCampanhaDoZero(clientId);
  const primeiras = dados.ok && dados.contas[0] ? await listarPaginas(clientId, dados.contas[0].id) : null;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Link href={`/meta-ads/${clientId}`} className="text-sm text-foreground-muted inline-flex items-center gap-1.5 hover:text-foreground w-fit">
        <ArrowLeft size={14} /> Voltar pra loja
      </Link>
      <Link href={`/meta-ads/${clientId}/campanha-do-zero/ajustar`} className="text-sm text-accent w-fit">
        Ajustar uma campanha já criada →
      </Link>
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Rocket size={20} /> Campanha do zero{dados.ok ? ` — ${dados.loja}` : ""}
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Cria a campanha, os conjuntos e um anúncio por carro do estoque, com destino <strong>mensagem no WhatsApp</strong>. Tudo nasce{" "}
          <strong>pausado</strong>: confira no Gerenciador e ligue quando estiver certo. O “alcançar mais pessoas” fica desligado e os
          aprimoramentos automáticos da Meta também.
        </p>
      </div>
      {!dados.ok ? (
        <p className="text-sm text-red-500">{dados.erro}</p>
      ) : dados.contas.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">Esta loja não tem conta de anúncio ligada. Ligue a conta em Meta Ads → vincular contas.</p>
      ) : dados.carros.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          O estoque desta loja está vazio. Ligue o site da loja em Inteligência Comercial → Estoque e leia o estoque primeiro.
        </p>
      ) : (
        <FormularioDoZero
          clientId={clientId}
          loja={dados.loja}
          rodape={dados.rodape}
          artesSoltas={dados.artesSoltas}
          rodapeDoSite={dados.rodapeDoSite}
          contas={dados.contas}
          carros={dados.carros}
          paginasIniciais={primeiras && primeiras.ok ? primeiras.paginas : []}
          erroDasPaginas={primeiras ? (primeiras.ok ? (primeiras.aviso ?? null) : primeiras.erro) : null}
        />
      )}
    </div>
  );
}
