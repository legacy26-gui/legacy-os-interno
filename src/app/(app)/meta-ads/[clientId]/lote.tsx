"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { AlertTriangle, Archive, Pencil, Power, Trash2 } from "lucide-react";
import { acaoEmLoteNaMeta } from "@/lib/actions/meta-ads";

// Selecionar vários e agir de uma vez — no desenho do Gerenciador.
//
// ── Por que um provedor, e não uma tabela de navegador ───────────────────
//
// Porque a tabela é desenhada no servidor, e é melhor que continue sendo: ela
// lê o banco, calcula custo por lead e monta doze colunas. Transformar tudo
// em componente de navegador só pra guardar quais linhas estão marcadas
// mandaria todos esses dados pro navegador à toa.
//
// Então só a SELEÇÃO vive aqui. O provedor envolve a tabela inteira, cada
// linha recebe uma caixinha, e a barra fica em cima. As linhas continuam
// vindo prontas do servidor.
//
// ── Por que a barra fica em cima e sempre visível ────────────────────────
//
// Primeiro eu fiz ela flutuando no rodapé, aparecendo só quando havia algo
// marcado. O Gerenciador faz o contrário: a barra está sempre lá, acima da
// tabela, com os botões apagados até você marcar alguma coisa.
//
// A diferença não é estética. Barra que só aparece depois não ensina que
// existe: quem nunca marcou uma linha nunca descobre que dá pra desligar
// cinco de uma vez. Apagada e visível, ela conta o que a tela sabe fazer
// antes de alguém precisar.

interface Item {
  id: string;
  nome: string;
}

interface Estado {
  marcados: Map<string, string>;
  todos: Item[];
  alternar: (id: string, nome: string) => void;
  marcarTodos: () => void;
  limpar: () => void;
}

const Contexto = createContext<Estado | null>(null);

export function LoteProvider({
  todos,
  children,
}: {
  todos: Item[];
  children: ReactNode;
}) {
  const [marcados, setMarcados] = useState<Map<string, string>>(new Map());

  function alternar(id: string, nome: string) {
    setMarcados((antes) => {
      const novo = new Map(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.set(id, nome);
      return novo;
    });
  }

  return (
    <Contexto.Provider
      value={{
        marcados,
        todos,
        alternar,
        marcarTodos: () =>
          setMarcados((antes) =>
            antes.size === todos.length
              ? new Map()
              : new Map(todos.map((t) => [t.id, t.nome])),
          ),
        limpar: () => setMarcados(new Map()),
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

/** A caixinha de cada linha. */
export function CaixaDeSelecao({ id, nome }: { id: string; nome: string }) {
  const ctx = useContext(Contexto);
  if (!ctx) return null;

  return (
    <label className="flex items-center justify-center w-11 h-11 -my-3 cursor-pointer">
      <input
        type="checkbox"
        checked={ctx.marcados.has(id)}
        onChange={() => ctx.alternar(id, nome)}
        aria-label={`Selecionar ${nome}`}
        className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
      />
    </label>
  );
}

/**
 * A caixinha do cabeçalho, que marca e desmarca a lista inteira.
 *
 * Fica num estado "meio marcado" quando só parte está escolhida — é o que o
 * Gerenciador faz, e é o que evita a dúvida de "marquei tudo ou não?" numa
 * lista que rola.
 */
export function CaixaDeTodos() {
  const ctx = useContext(Contexto);
  if (!ctx) return null;
  const total = ctx.todos.length;
  const marcados = ctx.marcados.size;

  return (
    <label className="flex items-center justify-center w-11 h-11 -my-3 cursor-pointer">
      <input
        type="checkbox"
        checked={total > 0 && marcados === total}
        ref={(el) => {
          if (el) el.indeterminate = marcados > 0 && marcados < total;
        }}
        onChange={ctx.marcarTodos}
        aria-label="Selecionar todos"
        className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
      />
    </label>
  );
}

// Campanha é feminina, conjunto e anúncio são masculinos. Sem isto a barra
// escreve "1 campanha selecionado", que é o tipo de errinho que faz o sistema
// parecer feito às pressas.
const ROTULO_DO_NIVEL: Record<string, { nome: string; feminino: boolean }> = {
  campanha: { nome: "campanha", feminino: true },
  conjunto: { nome: "conjunto", feminino: false },
  anuncio: { nome: "anúncio", feminino: false },
};

/** A barra de ações, acima da tabela, como no Gerenciador. */
export function BarraDeAcoes({
  clientId,
  nivel,
  podeExcluir,
}: {
  clientId: string;
  nivel: string;
  podeExcluir: boolean;
}) {
  const ctx = useContext(Contexto);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{
    texto: string;
    acao: string;
  } | null>(null);
  const [pendente, comecar] = useTransition();

  if (!ctx) return null;

  const ids = [...ctx.marcados.keys()];
  const quantos = ids.length;
  const nada = quantos === 0;
  const termo = ROTULO_DO_NIVEL[nivel] ?? { nome: "item", feminino: false };
  const rotulo = termo.nome + (quantos === 1 ? "" : "s");
  const selecionado =
    "selecionad" + (termo.feminino ? "a" : "o") + (quantos === 1 ? "" : "s");

  function mandar(acao: string, confirmado: boolean) {
    setErro(null);
    setOk(null);
    setConfirmar(null);
    comecar(async () => {
      const r = await acaoEmLoteNaMeta(clientId, nivel, ids, acao, confirmado);
      if (r?.precisaConfirmar) {
        setConfirmar({ texto: r.precisaConfirmar, acao });
        return;
      }
      if (r?.erro) {
        setErro(r.erro);
        return;
      }
      setOk(r?.ok ?? "Feito.");
      ctx!.limpar();
    });
  }

  const botao =
    "inline-flex items-center gap-1.5 px-3 min-h-10 rounded-lg border border-border text-sm font-medium " +
    "enabled:hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="px-5 py-2.5 border-b border-border flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={nada || pendente}
          onClick={() => mandar("desligar", false)}
          className={botao}
        >
          <Power size={14} /> Desligar
        </button>
        <button
          type="button"
          disabled={nada || pendente}
          onClick={() => mandar("arquivar", false)}
          className={botao}
        >
          <Archive size={14} /> Arquivar
        </button>
        {podeExcluir && (
          <button
            type="button"
            disabled={nada || pendente}
            onClick={() => mandar("excluir", false)}
            className={`${botao} enabled:text-red-600 dark:enabled:text-red-400 enabled:border-red-500/50 enabled:hover:bg-red-500/10`}
          >
            <Trash2 size={14} /> Excluir
          </button>
        )}

        {/* "Editar" desabilitado e sem função ainda: está aqui porque o
            Gerenciador tem, e porque some a dúvida de "cadê o editar?". No
            dia em que editar em lote existir, ele acende sozinho. */}
        <button
          type="button"
          disabled
          title="Editar vários de uma vez ainda não existe"
          className={botao}
        >
          <Pencil size={14} /> Editar
        </button>

        <span className="ml-auto text-sm text-foreground-muted">
          {nada ? (
            <span className="text-xs">
              Marque a caixinha pra agir em vários de uma vez
            </span>
          ) : (
            <>
              <strong className="text-foreground">{quantos}</strong> {rotulo}{" "}
              {selecionado}{" "}
              <button
                type="button"
                onClick={ctx.limpar}
                className="underline text-xs hover:text-foreground ml-1"
              >
                limpar
              </button>
            </>
          )}
        </span>
      </div>

      {confirmar && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2.5">
          <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>{confirmar.texto}</span>
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => mandar(confirmar.acao, true)}
              disabled={pendente}
              className={`px-3 min-h-10 rounded-lg text-xs font-medium text-white disabled:opacity-50 hover:opacity-90 ${
                confirmar.acao === "excluir" ? "bg-red-600" : "bg-accent"
              }`}
            >
              {pendente
                ? "Mandando…"
                : confirmar.acao === "excluir"
                  ? "Sim, excluir de vez"
                  : "Sim, arquivar"}
            </button>
            {/* A saída segura fica ao lado justamente no momento mais
                perigoso: mandar cancelar e recomeçar só aumenta a chance de
                a pessoa repetir o caminho que não tem volta. */}
            {confirmar.acao === "excluir" && (
              <button
                type="button"
                onClick={() => mandar("arquivar", false)}
                disabled={pendente}
                className="px-3 min-h-10 rounded-lg border border-border text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                Arquivar no lugar
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              className="px-3 min-h-10 text-xs text-foreground-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      {ok && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{ok}</p>
      )}
    </div>
  );
}

/** A ordem dos níveis. Descer é ir pra um número maior. */
const FUNDURA: Record<string, number> = {
  campanha: 0,
  conjunto: 1,
  anuncio: 2,
};

/**
 * As três abas, sabendo o que está marcado.
 *
 * ── Por que elas precisam ler a seleção ──────────────────────────────────
 *
 * Porque é assim que o Gerenciador funciona, e é o que a cabeça de quem usa
 * espera: marca a campanha, clica em "Conjuntos de anúncios", e vê os
 * conjuntos DAQUELA campanha.
 *
 * Antes a aba era um link comum, montado no servidor, que só trocava o
 * `nivel`. A marcação ficava pra trás — ela vive no navegador — e a tela
 * recarregava mostrando TODOS os conjuntos da conta, com as caixinhas
 * limpas. Parecia que o clique tinha desfeito o trabalho.
 *
 * Agora o link se monta aqui no navegador, com o que está marcado dentro
 * dele. A marcação em si continua se perdendo na navegação — é outra tela,
 * outra lista, outros itens — mas o FILTRO vai junto, que é o que a pessoa
 * queria quando marcou.
 *
 * Só com UM item marcado. Com dois, "os conjuntos daquela campanha" não quer
 * dizer nada, e o endereço só guarda uma campanha: filtrar pela primeira
 * seria escolher por conta própria e errar metade das vezes.
 *
 * E só pra DESCER. Clicar em "Campanhas" estando nos anúncios é voltar pro
 * começo; levar um filtro pra cima prenderia a pessoa num recorte que ela
 * não pediu.
 */
export function AbasDoNivel({
  nivel,
  abas,
}: {
  nivel: string;
  abas: { valor: string; rotulo: string }[];
}) {
  const ctx = useContext(Contexto);
  const caminho = usePathname();
  const params = useSearchParams();

  const marcados = ctx ? [...ctx.marcados.keys()] : [];
  const umSo = marcados.length === 1 ? marcados[0] : null;

  function endereco(destino: string) {
    const q = new URLSearchParams(params.toString());
    if (destino === "campanha") q.delete("nivel");
    else q.set("nivel", destino);

    if (umSo && FUNDURA[destino] > FUNDURA[nivel]) {
      if (nivel === "campanha") {
        q.set("campanha", umSo);
        // O conjunto de antes não vale mais: era de outra campanha.
        q.delete("conjunto");
      } else if (nivel === "conjunto") {
        q.set("conjunto", umSo);
      }
    }

    const busca = q.toString();
    return busca ? `${caminho}?${busca}` : caminho;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {abas.map((a) => {
        const acesa = nivel === a.valor;
        const leva = umSo !== null && FUNDURA[a.valor] > FUNDURA[nivel];
        return (
          <Link
            key={a.valor}
            href={endereco(a.valor)}
            aria-current={acesa ? "page" : undefined}
            title={
              leva
                ? "Abre só o que está dentro do item que você marcou"
                : undefined
            }
            className={`px-5 py-3 rounded-t-xl text-sm font-semibold border border-b-0 -mb-px transition-colors ${
              acesa
                ? "bg-surface text-accent border-border"
                : "bg-transparent text-foreground-muted border-transparent hover:bg-surface-muted"
            }`}
          >
            {a.rotulo}
            {/* O pontinho avisa, ANTES do clique, que esta aba vai abrir só o
                que está dentro do item marcado. Sem ele a pessoa descobre
                depois — e descobrir depois, numa lista de quarenta, é ter que
                voltar. */}
            {leva && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
