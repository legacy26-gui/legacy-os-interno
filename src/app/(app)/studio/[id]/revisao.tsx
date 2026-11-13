"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Undo2, Download, Trash2 } from "lucide-react";
import { aprovarArte, pedirCorrecao, apagarArte } from "@/lib/actions/studio";

// Aprovar, pedir correção, baixar.
//
// ── Por que pedir correção abre um campo em vez de só marcar ────────────
//
// Porque "reprovado" sem motivo devolve a peça pra quem a fez sem dizer o
// que mudar. O resultado é sempre o mesmo: ou volta igual, ou vira um
// telefonema. O campo é obrigatório, e o texto fica guardado na peça — quem
// pega a correção três dias depois lê o que foi pedido, não a lembrança de
// alguém.
//
// ── Por que baixar é um link e não um botão ─────────────────────────────
//
// Porque o arquivo vem de um endereço, e link com `download` deixa o
// navegador fazer o que ele já sabe fazer: salvar com o nome certo, mostrar
// o progresso, funcionar com o botão direito. Um botão com JavaScript
// refazendo isso só acrescenta jeitos de quebrar.

export function Revisao({
  id,
  status,
  podeRevisar,
}: {
  id: string;
  status: "PRONTO" | "APROVADO" | "CORRIGIR";
  podeRevisar: boolean;
}) {
  const router = useRouter();
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [abrirCorrecao, setAbrirCorrecao] = useState(false);
  const [motivo, setMotivo] = useState("");

  function aprovar() {
    setErro(null);
    comecar(async () => {
      const r = await aprovarArte(id);
      if (r?.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  function corrigir() {
    setErro(null);
    comecar(async () => {
      const r = await pedirCorrecao(id, motivo);
      if (r?.erro) {
        setErro(r.erro);
        return;
      }
      setAbrirCorrecao(false);
      setMotivo("");
      router.refresh();
    });
  }

  function apagar() {
    // Apagar não tem volta e some com a foto junto. Uma confirmação que diz
    // o que vai acontecer, e não um "tem certeza?" genérico.
    if (!confirm("Apagar esta arte? A foto do veículo some junto, e não dá pra desfazer.")) {
      return;
    }
    setErro(null);
    comecar(async () => {
      const r = await apagarArte(id);
      if (r?.erro) setErro(r.erro);
      else router.push("/studio");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/studio/arte/${id}?formato=feed`}
          download
          className="inline-flex items-center gap-2 px-4 min-h-11 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
        >
          <Download size={15} /> Baixar feed
        </a>
        <a
          href={`/api/studio/arte/${id}?formato=story`}
          download
          className="inline-flex items-center gap-2 px-4 min-h-11 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
        >
          <Download size={15} /> Baixar Stories
        </a>

        {podeRevisar && status !== "APROVADO" && (
          <button
            type="button"
            onClick={aprovar}
            disabled={pendente}
            className="inline-flex items-center gap-2 px-4 min-h-11 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            <Check size={15} /> Aprovar
          </button>
        )}

        {podeRevisar && status !== "CORRIGIR" && (
          <button
            type="button"
            onClick={() => setAbrirCorrecao((v) => !v)}
            disabled={pendente}
            className="inline-flex items-center gap-2 px-4 min-h-11 bg-surface border border-amber-500/60 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/10 disabled:opacity-60"
          >
            <Undo2 size={15} /> Pedir correção
          </button>
        )}

        {podeRevisar && (
          <button
            type="button"
            onClick={apagar}
            disabled={pendente}
            className="inline-flex items-center gap-2 px-3 min-h-11 text-foreground-muted rounded-lg text-sm hover:text-red-500 disabled:opacity-60"
          >
            <Trash2 size={15} /> Apagar
          </button>
        )}
      </div>

      {abrirCorrecao && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            O que precisa mudar
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            placeholder="Ex.: o preço está errado, são 92.900. E a foto está escura demais."
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={corrigir}
              disabled={pendente || motivo.trim().length < 3}
              className="inline-flex items-center gap-2 px-4 min-h-11 bg-amber-600 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              Mandar correção
            </button>
            <button
              type="button"
              onClick={() => setAbrirCorrecao(false)}
              className="px-4 min-h-11 text-sm text-foreground-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-red-500">{erro}</p>}
    </div>
  );
}
