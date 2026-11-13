import Link from "next/link";
import { ArrowLeft, Link2, AlertTriangle } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { contasDisponiveis, sugerirLoja } from "@/lib/meta/contas-disponiveis";
import { ListaDeVinculos } from "./lista";

// Ligar cada conta de anúncio da Meta à loja certa.
//
// A alternativa era o Guilherme exportar quarenta e um `act_...` do
// Gerenciador e colar aqui. Mas a Meta JÁ SABE quais contas ele alcança — é a
// mesma lista que ele vê no Gerenciador de Negócios. Perguntar a ela troca
// quarenta e um copiar-e-colar por quarenta e um cliques de conferência.
//
// E responde de graça a pergunta que ele precisa fazer: quais lojas ainda não
// estão na BM. Loja sem conta correspondente aqui não é falha do sistema, é
// acesso que ainda não foi dado lá.
//
// Quem confirma é gente, uma por uma. A sugestão por nome é palpite: conta
// vinculada à loja errada manda o gasto de uma pra ficha da outra, e ninguém
// desconfia de um número que chegou sozinho.

export const maxDuration = 60;

export default async function VincularPage() {
  const user = await requireModuleAccess("clientes");

  // Vincular é da direção — a mesma regra do botão na ficha do cliente.
  if (user.role !== "ADMIN" && user.role !== "GERENTE") {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-surface p-6">
        <h1 className="font-semibold">Vincular contas é da direção</h1>
        <p className="text-sm text-foreground-muted mt-2">
          Você continua vendo o saldo e os números das suas lojas em{" "}
          <Link href="/meta-ads" className="text-accent hover:underline">
            Meta Ads
          </Link>
          .
        </p>
      </div>
    );
  }

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      metaAdAccounts: {
        where: { active: true },
        select: { id: true, metaAccountId: true },
      },
    },
  });

  const resposta = await contasDisponiveis();

  if (!resposta.ok) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <Voltar href="/meta-ads">Meta Ads</Voltar>
        <div className="rounded-2xl border border-red-500/50 bg-red-500/5 p-6 flex flex-col gap-3">
          <h1 className="font-semibold flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" /> Não deu pra perguntar à Meta
          </h1>
          <p className="text-xs font-mono text-red-500 break-words">{resposta.erro}</p>
          <p className="text-sm text-foreground-muted">
            Sem a lista da Meta, ainda dá pra vincular uma conta por vez pela ficha de cada loja.
          </p>
        </div>
      </div>
    );
  }

  const simples = lojas.map((l) => ({ id: l.id, companyName: l.companyName }));
  const contas = resposta.contas.map((c) => ({
    ...c,
    sugestao: c.jaVinculadaA ? null : sugerirLoja(c.nome, simples),
  }));

  // Lojas que não têm conta nenhuma e para as quais nada foi sugerido: é a
  // lista do que falta pedir acesso na BM.
  const sugeridas = new Set(contas.map((c) => c.sugestao?.clientId).filter(Boolean));
  const semNadaAVista = lojas.filter(
    (l) => l.metaAdAccounts.length === 0 && !sugeridas.has(l.id)
  );

  const porVincular = contas.filter((c) => !c.jaVinculadaA);

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <Voltar href="/meta-ads">Meta Ads</Voltar>
        <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
          <Link2 size={20} className="text-accent" /> Vincular contas de anúncio
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Estas são as contas que o nosso acesso enxerga na Meta. Confira a loja de cada uma e
          marque as que quer vincular.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Cartao titulo="Contas na Meta" valor={String(contas.length)} />
        <Cartao
          titulo="Já vinculadas"
          valor={`${contas.length - porVincular.length} de ${contas.length}`}
        />
        <Cartao
          titulo="Lojas sem conta"
          valor={String(lojas.filter((l) => l.metaAdAccounts.length === 0).length)}
          fraco
        />
      </div>

      {semNadaAVista.length > 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>
              {semNadaAVista.length}{" "}
              {semNadaAVista.length === 1 ? "loja não tem" : "lojas não têm"} nenhuma conta
              parecida na lista da Meta:
            </strong>{" "}
            {semNadaAVista.map((l) => l.companyName).join(", ")}. Provavelmente a conta de anúncio
            delas ainda não foi compartilhada com o seu Gerenciador de Negócios — isso se resolve
            lá, não aqui.
          </p>
        </div>
      )}

      <ListaDeVinculos contas={contas} lojas={simples} />
    </div>
  );
}


function Cartao({ titulo, valor, fraco }: { titulo: string; valor: string; fraco?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">{titulo}</p>
      <p className={`text-xl font-semibold mt-1 ${fraco ? "text-foreground-muted" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
