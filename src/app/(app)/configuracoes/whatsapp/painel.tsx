"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Users,
  Link2,
} from "lucide-react";
import {
  buscarGruposDaZapi,
  mandarTesteNoWhatsapp,
} from "@/lib/actions/whatsapp";
import type { EstadoDaLigacao, GrupoNaTela } from "@/lib/whatsapp/ligacao";
import { definirGrupoDoWhatsapp } from "@/lib/actions/meta-ads";

interface Loja {
  id: string;
  nome: string;
  grupoId: string | null;
}

export function PainelDoWhatsapp({
  estado,
  variaveis,
  lojas: lojasIniciais,
}: {
  estado: EstadoDaLigacao;
  variaveis: { nome: string; onde: string }[];
  lojas: Loja[];
}) {
  const [lojas, setLojas] = useState(lojasIniciais);
  const [grupos, setGrupos] = useState<GrupoNaTela[] | null>(null);
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);
  const [buscando, buscar] = useTransition();

  const semGrupo = lojas.filter((l) => !l.grupoId);

  return (
    <div className="flex flex-col gap-6">
      <Conexao estado={estado} variaveis={variaveis} />

      {estado.configurado && (
        <>
          {/* ── Os grupos ───────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Users size={16} /> Grupo de cada loja
                </h2>
                <p className="text-sm text-foreground-muted mt-0.5">
                  Escolhido numa lista, não digitado. Errar um dígito aqui
                  manda o relatório de uma loja pro grupo de outra, e isso não
                  tem como desfazer.
                </p>
              </div>
              <button
                type="button"
                disabled={buscando || !estado.conectado}
                title={
                  estado.conectado
                    ? undefined
                    : "Precisa do número conectado pra listar os grupos"
                }
                onClick={() => {
                  setErroGrupos(null);
                  buscar(async () => {
                    const r = await buscarGruposDaZapi();
                    if (r.ok) setGrupos(r.grupos);
                    else setErroGrupos(r.erro);
                  });
                }}
                className="inline-flex items-center gap-2 min-h-10 px-4 rounded-lg border border-border
                  bg-surface-muted text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                <RefreshCw size={14} className={buscando ? "animate-spin" : ""} />
                {buscando ? "Buscando…" : "Buscar grupos do número"}
              </button>
            </div>

            {erroGrupos && (
              <p className="text-sm text-red-500 flex items-start gap-1.5">
                <XCircle size={15} className="shrink-0 mt-0.5" />
                {erroGrupos}
              </p>
            )}

            {grupos !== null && grupos.length === 0 && !erroGrupos && (
              <p className="text-sm text-foreground-muted">
                O número não está em nenhum grupo ainda. Adicione o chip do
                robô aos grupos das lojas pelo WhatsApp e busque de novo.
              </p>
            )}

            <div className="flex flex-col divide-y divide-border">
              {lojas.map((loja) => (
                <LinhaDaLoja
                  key={loja.id}
                  loja={loja}
                  grupos={grupos}
                  aoLigar={(grupoId) =>
                    setLojas((atual) =>
                      atual.map((l) =>
                        l.id === loja.id ? { ...l, grupoId } : l,
                      ),
                    )
                  }
                />
              ))}
            </div>

            {semGrupo.length > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  {semGrupo.length === 1
                    ? "1 loja ainda sem grupo: "
                    : `${semGrupo.length} lojas ainda sem grupo: `}
                  {semGrupo.map((l) => l.nome).join(", ")}. O relatório delas
                  continua sendo mandado na mão.
                </span>
              </p>
            )}
          </section>

          <Teste conectado={estado.conectado} />
        </>
      )}
    </div>
  );
}

/** O cartão de cima: está ligado ou não, e o que fazer se não estiver. */
function Conexao({
  estado,
  variaveis,
}: {
  estado: EstadoDaLigacao;
  variaveis: { nome: string; onde: string }[];
}) {
  if (!estado.configurado) {
    return (
      <section className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 flex flex-col gap-3">
        <h2 className="font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} /> Falta configurar
        </h2>
        <p className="text-sm text-foreground-muted">
          O sistema inteiro já está pronto — falta só o segredo, que mora na
          Vercel e não pode passar por aqui. Em{" "}
          <strong>Settings → Environment Variables</strong>, em{" "}
          <strong>Production</strong>, cole:
        </p>
        <ul className="flex flex-col gap-2">
          {variaveis.map((v) => {
            const falta = estado.faltando.includes(v.nome);
            return (
              <li
                key={v.nome}
                className="flex items-start gap-2 text-sm flex-wrap"
              >
                {falta ? (
                  <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2
                    size={15}
                    className="text-emerald-500 shrink-0 mt-0.5"
                  />
                )}
                <code className="px-1.5 py-0.5 rounded bg-surface-muted font-mono text-xs">
                  {v.nome}
                </code>
                <span className="text-foreground-muted">
                  {falta ? `— ${v.onde}` : "— já está lá"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-foreground-muted">
          Depois de salvar as três, a Vercel precisa publicar de novo pra elas
          valerem. Então é só recarregar esta tela.
        </p>
      </section>
    );
  }

  if (!estado.conectado) {
    return (
      <section className="rounded-2xl border border-red-500/50 bg-red-500/10 p-5 flex flex-col gap-2">
        <h2 className="font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
          <XCircle size={16} /> Configurado, mas o número não está conectado
        </h2>
        <p className="text-sm text-foreground-muted">
          As três variáveis estão lá, mas a instância não tem um WhatsApp
          pareado — ou o celular que hospeda a sessão caiu. No painel da
          Z-API, leia o QR Code com o chip do robô.
          {estado.erro && (
            <>
              {" "}
              A Z-API disse: <em>{estado.erro}</em>
            </>
          )}
        </p>
        <p className="text-xs text-foreground-muted">
          Enquanto estiver assim, nenhum relatório sai — o que é melhor que
          sair pela metade.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-5 flex flex-col gap-2">
      <h2 className="font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 size={16} /> Conectado
      </h2>
      <p className="text-sm text-foreground-muted">
        {estado.numero ? (
          <>
            O robô está falando pelo número{" "}
            <strong className="text-foreground">{estado.numero}</strong>
            {estado.nomeDoAparelho && <> ({estado.nomeDoAparelho})</>}.
          </>
        ) : (
          <>A instância está conectada.</>
        )}
      </p>
      {/* O combinado é chip DEDICADO. Se um dia aparecer aqui o número
          pessoal da agência, é melhor descobrir lendo esta linha do que no
          dia em que a Meta bloquear e levar o atendimento junto. */}
      <p className="text-xs text-foreground-muted">
        Confira se é mesmo o chip do robô, e não um número que a equipe usa
        pra atender. A Z-API não é oficial: a Meta pode bloquear esse número
        sem avisar, e o que cair junto é o que estiver nele.
      </p>
    </section>
  );
}

/** Uma loja e o grupo dela. */
function LinhaDaLoja({
  loja,
  grupos,
  aoLigar,
}: {
  loja: Loja;
  grupos: GrupoNaTela[] | null;
  aoLigar: (grupoId: string | null) => void;
}) {
  const [pendente, comecar] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);

  const atual = grupos?.find((g) => g.id === loja.grupoId) ?? null;

  function escolher(valor: string) {
    setMsg(null);
    comecar(async () => {
      const r = await definirGrupoDoWhatsapp(loja.id, valor);
      setMsg(r.erro ? { erro: r.erro } : { ok: r.ok });
      if (!r.erro) aoLigar(valor || null);
    });
  }

  return (
    <div className="py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-medium text-sm">{loja.nome}</span>

        {grupos === null ? (
          // Sem a lista buscada, mostra o que está guardado — e só. Um campo
          // de digitar aqui traria de volta exatamente o erro que esta tela
          // existe pra matar.
          <span className="text-xs text-foreground-muted font-mono">
            {loja.grupoId ?? "sem grupo"}
          </span>
        ) : (
          <select
            value={loja.grupoId ?? ""}
            disabled={pendente}
            onChange={(e) => escolher(e.target.value)}
            className="min-h-10 px-3 rounded-lg border border-border bg-surface-muted text-sm
              min-w-[16rem] max-w-full disabled:opacity-50"
          >
            <option value="">— sem grupo —</option>
            {grupos.map((g) => {
              // Grupo já usado por OUTRA loja aparece, mas dizendo de quem é:
              // esconder faria a pessoa procurar um grupo que existe e não
              // aparece. O servidor recusa de qualquer jeito.
              const deOutra = g.lojaId && g.lojaId !== loja.id;
              return (
                <option key={g.id} value={g.id}>
                  {g.nome}
                  {deOutra ? ` — já é de ${g.lojaNome}` : ""}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {atual && (
        <span className="text-xs text-foreground-muted">
          Hoje vai para <strong>{atual.nome}</strong>
        </span>
      )}
      {msg?.ok && (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">
          {msg.ok}
        </span>
      )}
      {msg?.erro && (
        <span className="text-xs text-red-500">{msg.erro}</span>
      )}
    </div>
  );
}

/** O tiro de teste, pra não estrear no grupo de um cliente. */
function Teste({ conectado }: { conectado: boolean }) {
  const [destino, setDestino] = useState("");
  const [estado, setEstado] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Send size={16} /> Mandar um teste
        </h2>
        <p className="text-sm text-foreground-muted mt-0.5">
          Mande para o seu próprio número antes de deixar o robô falar com
          cliente. Telefone com DDI e DDD, só números (5554999887766), ou o id
          de um grupo.
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <input
          value={destino}
          onChange={(e) => {
            setDestino(e.target.value);
            setEstado({});
          }}
          placeholder="5554999887766"
          inputMode="tel"
          className="flex-1 min-w-[14rem] min-h-11 px-3 rounded-lg border border-border
            bg-surface-muted text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pendente || !destino.trim() || !conectado}
          title={conectado ? undefined : "O número não está conectado"}
          onClick={() =>
            comecar(async () => setEstado(await mandarTesteNoWhatsapp(destino)))
          }
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-accent text-white
            text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Send size={15} /> {pendente ? "Mandando…" : "Mandar"}
        </button>
      </div>
      {estado.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p className="text-sm text-red-500 flex items-start gap-1.5">
          <XCircle size={15} className="shrink-0 mt-0.5" /> {estado.erro}
        </p>
      )}
      <p className="text-xs text-foreground-muted flex items-start gap-1.5">
        <Link2 size={12} className="shrink-0 mt-0.5" />
        Esta mensagem sai pelo mesmo caminho do relatório. Se ela chegar, o
        relatório também chega.
      </p>
    </section>
  );
}
