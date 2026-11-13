"use client";

import { useState, useTransition } from "react";
import { Palette, Upload, Check } from "lucide-react";
import { salvarMarca } from "@/lib/actions/studio";
import { LAYOUTS, type Layout } from "@/lib/studio/layouts";

// A identidade visual de uma loja.
//
// Uma linha por loja, cada uma com o próprio formulário. Não é a tela mais
// bonita possível, e é a mais útil: a pessoa que vai preencher isto preenche
// as quarenta de uma sentada, e trocar de página quarenta vezes é o que faz
// a tarefa nunca terminar.

export interface MarcaNaTela {
  clientId: string;
  nome: string;
  logoUrl: string | null;
  layout: Layout;
  corPrimaria: string;
  corFundo: string;
  corTexto: string;
  telefone: string;
  endereco: string;
}

export function Marcas({ lojas, podeEditar }: { lojas: MarcaNaTela[]; podeEditar: boolean }) {
  if (lojas.length === 0) {
    return (
      <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
        Nenhuma loja na sua carteira.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {lojas.map((l) => (
        <LinhaDaMarca key={l.clientId} loja={l} podeEditar={podeEditar} />
      ))}
    </ul>
  );
}

function LinhaDaMarca({ loja, podeEditar }: { loja: MarcaNaTela; podeEditar: boolean }) {
  const [pendente, comecar] = useTransition();
  const [estado, setEstado] = useState<{ erro?: string; ok?: string }>({});
  const [aberto, setAberto] = useState(false);
  const [logoNova, setLogoNova] = useState<string | null>(null);
  // Mesmo motivo do formulário de nova arte: o React limpa o campo de
  // arquivo quando a ação termina, inclusive em erro. Sem guardar o File,
  // quem errasse uma cor perderia a logo que acabou de escolher.
  const [arquivoDaLogo, setArquivoDaLogo] = useState<File | null>(null);

  // `onSubmit` e não `action={}` pelo mesmo motivo do formulário de nova
  // arte: com `action`, o React limpa tudo quando a ação termina, mesmo em
  // erro — e quem errasse uma cor perderia a logo que acabou de escolher.
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setEstado({});
    if (arquivoDaLogo) formData.set("logo", arquivoDaLogo);
    comecar(async () => {
      const r = await salvarMarca(
        loja.clientId,
        {
          layout: (formData.get("layout") as string) ?? "degrade",
          corPrimaria: (formData.get("corPrimaria") as string) ?? "",
          corFundo: (formData.get("corFundo") as string) ?? "",
          corTexto: (formData.get("corTexto") as string) ?? "",
          telefone: (formData.get("telefone") as string) ?? "",
          endereco: (formData.get("endereco") as string) ?? "",
        },
        formData
      );
      setEstado(r ?? {});
    });
  }

  const logo = logoNova ?? loja.logoUrl;

  return (
    <li className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-3 px-4 min-h-14 py-2 text-left hover:bg-surface-muted"
      >
        {/* A logo em cima de preto, que é o fundo real da arte: logo branca
            num quadradinho branco parece ausente. */}
        <span className="shrink-0 w-14 h-10 rounded border border-border bg-black flex items-center justify-center overflow-hidden">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <Palette size={14} className="text-foreground-muted" />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{loja.nome}</span>
          <span className="block text-xs text-foreground-muted">
            {loja.logoUrl ? "identidade cadastrada" : "sem identidade — arte sai sem logo"}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {[loja.corPrimaria, loja.corFundo, loja.corTexto].map((c, i) => (
            <span
              key={i}
              className="w-4 h-4 rounded-full border border-border"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
      </button>

      {aberto && (
        <form onSubmit={salvar} className="px-4 pb-4 flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Logo
            </span>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-accent hover:underline">
              <Upload size={14} />
              {loja.logoUrl ? "Trocar a logo" : "Escolher a logo"}
              <input
                type="file"
                name="logo"
                accept="image/*"
                disabled={!podeEditar}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setArquivoDaLogo(f ?? null);
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setLogoNova(typeof r.result === "string" ? r.result : null);
                  r.readAsDataURL(f);
                }}
                className="hidden"
              />
            </label>
            <span className="text-xs text-foreground-muted">
              PNG com fundo transparente é o ideal — a logo vai em cima da foto do carro.
            </span>
          </div>

          {/* O desenho da loja.
              Três inteiros e não um com opções soltas: opção multiplica
              combinações que ninguém testou, e metade sai feia. Três
              desenhos pensados até o fim é o que se escolhe em dez
              segundos. */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1.5">
              Desenho da arte
            </legend>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(LAYOUTS) as Layout[]).map((k) => (
                <label
                  key={k}
                  className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer hover:border-border-forte has-[:checked]:border-accent"
                >
                  <input
                    type="radio"
                    name="layout"
                    value={k}
                    defaultChecked={loja.layout === k}
                    disabled={!podeEditar}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{LAYOUTS[k].nome}</span>
                    <span className="block text-xs text-foreground-muted">
                      {LAYOUTS[k].descricao}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-3 gap-3">
            <Cor nome="corPrimaria" rotulo="Principal" valor={loja.corPrimaria} ativo={podeEditar} />
            <Cor nome="corFundo" rotulo="Fundo" valor={loja.corFundo} ativo={podeEditar} />
            <Cor nome="corTexto" rotulo="Texto" valor={loja.corTexto} ativo={podeEditar} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
                Telefone
              </span>
              <input
                name="telefone"
                defaultValue={loja.telefone}
                disabled={!podeEditar}
                autoComplete="off"
                placeholder="(54) 99999-9999"
                className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
                Endereço
              </span>
              <input
                name="endereco"
                defaultValue={loja.endereco}
                disabled={!podeEditar}
                autoComplete="off"
                placeholder="Av. Brasil, 1200"
                className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-foreground-muted">
            Telefone e endereço viram a barra do rodapé da arte. Em branco, a barra some.
          </p>

          {estado.erro && <p className="text-sm text-red-500">{estado.erro}</p>}
          {estado.ok && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Check size={14} /> {estado.ok}
            </p>
          )}

          {podeEditar && (
            <button
              type="submit"
              disabled={pendente}
              className="self-start px-4 min-h-11 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {pendente ? "Guardando…" : "Guardar identidade"}
            </button>
          )}
        </form>
      )}
    </li>
  );
}

/**
 * Um campo de cor.
 *
 * Dois controles ligados ao mesmo valor: o seletor do sistema operacional,
 * pra quem quer escolher no olho, e o texto, pra quem tem o código da marca
 * anotado. Só o seletor obrigaria a pessoa a acertar o #FFC20E no olho.
 */
function Cor({
  nome,
  rotulo,
  valor,
  ativo,
}: {
  nome: string;
  rotulo: string;
  valor: string;
  ativo: boolean;
}) {
  const [cor, setCor] = useState(valor);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
        {rotulo}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={cor}
          disabled={!ativo}
          onChange={(e) => setCor(e.target.value)}
          className="w-11 h-11 rounded-lg border border-border bg-background p-1 cursor-pointer"
          aria-label={`${rotulo} — seletor`}
        />
        <input
          name={nome}
          value={cor}
          disabled={!ativo}
          onChange={(e) => setCor(e.target.value)}
          spellCheck={false}
          className="w-full min-w-0 px-2 min-h-11 rounded-lg border border-border bg-background text-sm font-mono uppercase"
        />
      </span>
    </label>
  );
}
