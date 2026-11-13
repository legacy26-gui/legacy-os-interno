"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { corrigirArte } from "@/lib/actions/studio";

// Arrumar os dados de uma arte sem refazer tudo.
//
// ── Por que isto é o pedaço que faltava ──────────────────────────────────
//
// A esteira tinha "pedir correção" e não tinha "fazer a correção". Dava pra
// escrever "o preço está errado, são 92.900", a peça ficava vermelha — e
// não existia tela nenhuma pra consertar. A única saída era apagar e criar
// de novo, reanexando a foto. Na prática ninguém faria isso, e a correção
// viraria um recado parado numa tela.
//
// ── Por que a foto não se troca aqui ─────────────────────────────────────
//
// Porque "a foto está ruim" não é correção, é outra arte. Trocar a imagem
// muda a peça inteira — o recorte, o contraste, o que aparece atrás do
// texto — e aproveitar o registro antigo esconderia isso atrás de uma
// palavra pequena. Foto errada se resolve apagando e criando de novo, que é
// o que o caso de fato pede.
//
// O que se arruma aqui é o que se digitou: modelo, ano, quilometragem,
// preço e chamada. Que é onde o erro mora quase sempre.

export function Editar({
  id,
  modelo,
  ano,
  km,
  precoTexto,
  chamada,
}: {
  id: string;
  modelo: string;
  ano: string;
  km: string;
  precoTexto: string;
  chamada: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // `onSubmit` pelo mesmo motivo dos outros dois: `action={}` limpa o
  // formulário ao fim da ação, e aqui isso apagaria a correção inteira
  // justamente quando o servidor recusou alguma coisa.
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    comecar(async () => {
      const r = await corrigirArte(id, {
        modelo: (formData.get("modelo") as string) ?? "",
        ano: (formData.get("ano") as string) ?? "",
        kmTexto: (formData.get("km") as string) ?? "",
        preco: (formData.get("preco") as string) ?? "",
        chamada: (formData.get("chamada") as string) ?? "",
      });
      if (r?.erro) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      // `refresh` e não reload: a imagem é desenhada na hora pelo servidor,
      // então recarregar os dados do servidor já traz a arte nova.
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start inline-flex items-center gap-2 px-4 min-h-11 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
      >
        <Pencil size={15} /> Arrumar os dados
      </button>
    );
  }

  return (
    <form
      onSubmit={salvar}
      className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
          Arrumar os dados
        </p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="inline-flex items-center justify-center w-11 h-11 -m-2 text-foreground-muted hover:text-foreground"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-foreground-muted">Modelo</span>
        <input
          name="modelo"
          defaultValue={modelo}
          required
          maxLength={80}
          autoComplete="off"
          className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground-muted">Ano</span>
          <input
            name="ano"
            defaultValue={ano}
            autoComplete="off"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground-muted">Quilometragem</span>
          <input
            name="km"
            defaultValue={km}
            autoComplete="off"
            inputMode="numeric"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground-muted">Preço</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
              R$
            </span>
            <input
              name="preco"
              defaultValue={precoTexto}
              inputMode="decimal"
              autoComplete="off"
              className="w-full pl-9 pr-3 min-h-11 rounded-lg border border-border bg-background text-sm tabular-nums"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground-muted">Chamada</span>
          <input
            name="chamada"
            defaultValue={chamada}
            maxLength={40}
            autoComplete="off"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
        </label>
      </div>

      {erro && <p className="text-sm text-red-500">{erro}</p>}

      <p className="text-xs text-foreground-muted">
        Salvar devolve a peça pra revisão: o que foi aprovado era o que estava escrito antes.
        {" "}A foto não muda aqui — foto errada é outra arte, não uma correção.
      </p>

      <button
        type="submit"
        disabled={pendente}
        className="self-start px-4 min-h-11 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Salvar e mandar pra revisão"}
      </button>
    </form>
  );
}
