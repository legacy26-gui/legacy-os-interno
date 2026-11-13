import Link from "next/link";
import { FileBarChart, AlertTriangle, ChevronRight } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, clienteEDaCarteira, veTodaACarteira } from "@/lib/carteira";
import { lerIntervalo, textoDaData } from "@/lib/meta/insights";
import { montarRelatorio } from "@/lib/meta/relatorio";
import { FormDoRelatorio } from "./form";
import { BotaoImagem } from "./imprimir";

// O relatório que vai pro dono da loja.
//
// ── Por que quatro números e não catorze ──────────────────────────────────
//
// Investido, leads, custo por lead e visualizações. Foi o Guilherme quem
// escolheu, e está certo: quem lê é dono de loja de carro, não gestor de
// tráfego. CTR e alcance não ajudam ele a decidir nada — só fazem o que
// importa competir por atenção com o que não importa.
//
// A tela interna continua mostrando tudo. São leitores diferentes, e misturar
// os dois seria servir mal aos dois.
//
// ── Por que é uma página e não um arquivo ────────────────────────────────
//
// Porque "Imprimir" no navegador já salva em PDF, e porque assim dá pra
// mexer no desenho sem refazer geração de arquivo. O Guilherme vai mandar o
// layout padrão dele — quando chegar, muda só o visual, e a conta por baixo
// continua a mesma.

export const maxDuration = 60;

type Busca = {
  loja?: string;
  periodo?: string;
  de?: string;
  ate?: string;
};

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const user = await requireModuleAccess("clientes");
  const busca = await searchParams;
  const periodo = lerIntervalo(busca);

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      manager: { select: { name: true } },
      _count: { select: { metaAdAccounts: true } },
    },
  });

  // Sem loja escolhida: o formulário E a lista de todas, prontas.
  //
  // ── Por que a lista existe ────────────────────────────────────────────
  //
  // Antes esta tela era só o formulário: escolha a loja, escolha o período,
  // gere. Para uma loja, tudo bem. Para a casa inteira numa segunda-feira de
  // manhã, são quarenta e duas idas e voltas no mesmo formulário.
  //
  // A lista inverte isso: os relatórios da semana JÁ ESTÃO AQUI, um clique
  // cada. Não há nada a gerar nem a esperar, porque a imagem é desenhada na
  // hora a partir de números que o robô atualiza de quinze em quinze minutos.
  // "Pronto" aqui quer dizer pronto mesmo, não "numa fila".
  //
  // O formulário continua embaixo, pra quando a pergunta for outra — um mês
  // fechado, uma data específica, a vida inteira da conta.
  if (!busca.loja) {
    const comConta = lojas.filter((l) => l._count.metaAdAccounts > 0);
    const semConta = lojas.filter((l) => l._count.metaAdAccounts === 0);

    return (
      <div className="flex flex-col gap-5 max-w-3xl">
        <Cabecalho />

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Relatórios da semana</h2>
            <span className="text-xs text-foreground-muted">últimos 7 dias</span>
          </div>

          {comConta.length === 0 ? (
            <p className="px-4 py-8 text-sm text-foreground-muted text-center">
              Nenhuma loja sua tem conta de anúncio vinculada ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {comConta.map((l) => (
                <li key={l.id}>
                  {/* A linha inteira é o link, com 44px de altura: no celular,
                      alvo pequeno obriga a mirar, e esta é a tela que o gestor
                      usa de pé, com o telefone na mão. */}
                  <Link
                    href={`/meta-ads/relatorio?loja=${l.id}&periodo=7d`}
                    className="flex items-center justify-between gap-3 px-4 min-h-11 py-2.5 hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{l.companyName}</span>
                      {veTodaACarteira(user) && l.manager?.name && (
                        <span className="block text-xs text-foreground-muted">
                          {l.manager.name.split(" ")[0]}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={16} className="text-foreground-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* As sem conta aparecem, e aparecem SEPARADAS.
              Esconder faria a lista parecer completa quando não está — e a
              loja que falta é justamente a que ninguém lembra de vincular. */}
          {semConta.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-surface-muted/40">
              <p className="text-xs text-foreground-muted">
                Sem relatório porque não têm conta de anúncio vinculada:{" "}
                {semConta.map((l) => l.companyName).join(", ")}.
              </p>
            </div>
          )}
        </div>

        <FormDoRelatorio
          lojas={lojas.map((l) => ({
            id: l.id,
            nome: l.companyName,
            gestor: l.manager?.name ?? null,
            temConta: l._count.metaAdAccounts > 0,
          }))}
          mostrarGestor={veTodaACarteira(user)}
          lojaAtual=""
          periodoAtual={periodo.chave}
          deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
          ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
        />
      </div>
    );
  }

  // A loja vem da URL: confere contra a carteira antes de qualquer número.
  if (!(await clienteEDaCarteira(user, busca.loja))) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <Cabecalho />
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Essa loja não está na sua lista.
        </p>
      </div>
    );
  }

  const r = await montarRelatorio(busca.loja, periodo);
  if (!r) return <p className="text-sm text-foreground-muted">Loja não encontrada.</p>;

  // Um endereço só, usado pelo preview e pelo botão de baixar. Dois iguais
  // escritos em lugares diferentes viram dois diferentes com o tempo.
  const enderecoDaImagem = `/api/meta-ads/relatorio?${new URLSearchParams({
    loja: busca.loja,
    ...(busca.periodo ? { periodo: busca.periodo } : {}),
    ...(busca.de ? { de: busca.de } : {}),
    ...(busca.ate ? { ate: busca.ate } : {}),
  })}`;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Tudo com print:hidden some na impressão: no papel fica só o
          relatório, que é o que vai pro cliente. */}
      <div className="print:hidden flex flex-col gap-5">
        <Cabecalho />
        <FormDoRelatorio
          lojas={lojas.map((l) => ({
            id: l.id,
            nome: l.companyName,
            gestor: l.manager?.name ?? null,
            temConta: l._count.metaAdAccounts > 0,
          }))}
          mostrarGestor={veTodaACarteira(user)}
          lojaAtual={busca.loja}
          periodoAtual={periodo.chave}
          deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
          ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground-muted">
            Confira abaixo e baixe a imagem pra mandar no WhatsApp da loja.
          </p>
          <BotaoImagem
            endereco={enderecoDaImagem}
            nome={`${r.loja.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.png`}
          />
        </div>
      </div>

      {!r.temDados ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 print:hidden">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              Esta loja ainda não teve uma leitura boa da Meta — ou não tem conta vinculada, ou a
              última busca falhou. Um relatório com R$ 0,00 em tudo é pior que relatório nenhum,
              então não gerei. Abra a loja em Meta Ads e aperte “Atualizar agora”.
            </span>
          </p>
        </div>
      ) : (
        /* O preview É a imagem que vai pro cliente.
           Antes esta tela desenhava o relatório de novo, em HTML, com as
           cores do sistema — duas pinturas do mesmo quadro. Funcionava até o
           dia em que uma mudasse e a outra não, e aí a pessoa conferia uma
           coisa e mandava outra. Agora o que se vê aqui é, byte por byte, o
           arquivo que o botão baixa.

           O <img> cru é de propósito: não é foto de página, é um PNG gerado
           sob medida e já no tamanho certo. Passar pelo otimizador do Next o
           recomprimiria à toa. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={enderecoDaImagem}
          alt={`Relatório de ${r.loja}`}
          className="w-full rounded-2xl border border-border print:border-0 print:rounded-none"
        />
      )}
    </div>
  );
}

function Cabecalho() {
  return (
    <div>
      <Voltar href="/meta-ads">Meta Ads</Voltar>
      <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
        <FileBarChart size={20} className="text-accent" /> Relatório para o cliente
      </h1>
      <p className="text-sm text-foreground-muted mt-0.5">
        Escolha a loja, o período e o detalhe. O relatório sai pronto pra mandar.
      </p>
    </div>
  );
}
