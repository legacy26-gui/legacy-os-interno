"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Video, Plus, Check } from "lucide-react";
import { createGravacao, type GravacaoFormState } from "@/lib/actions/gravacoes";
import { diaDaEntrega, diaCurto } from "@/lib/gravacoes";

// Lançar uma gravação: a loja, o dia, a hora e quantos vídeos saíram.
//
// Pensado pra ser preenchido no fim da gravação, com pressa: a data já vem
// com o dia de hoje, a quantidade com 1, e a data da entrega o sistema
// calcula (D+1) e mostra na tela antes de salvar. Quem precisar de outro
// prazo abre "outra data de entrega" e escolhe.

export interface LojaOpcao {
  id: string;
  companyName: string;
}

const campo =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

const OUTRA = "__outra";

function hoje() {
  // Data local da pessoa, não do servidor — ela está lançando o dia dela.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function GravacaoForm({
  lojas,
  podeEscolherLoja,
}: {
  lojas: LojaOpcao[];
  // No Treinamentos não existe carteira de lojas, então o nome é sempre
  // digitado e o seletor nem aparece.
  podeEscolherLoja: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, salvando] = useActionState<GravacaoFormState, FormData>(
    createGravacao,
    undefined
  );

  const [escolha, setEscolha] = useState(podeEscolherLoja && lojas.length > 0 ? "" : OUTRA);
  const [data, setData] = useState(hoje());
  const [prazoAberto, setPrazoAberto] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setData(hoje());
      setEscolha(podeEscolherLoja && lojas.length > 0 ? "" : OUTRA);
      setPrazoAberto(false);
    }
  }, [state, podeEscolherLoja, lojas.length]);

  const digitarNome = escolha === OUTRA;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {podeEscolherLoja && lojas.length > 0 ? (
          <select
            // Sem `name` de propósito: a opção "Outra loja" é um valor de
            // tela, não um id de cliente. Quem vai pro servidor é o campo
            // escondido abaixo, que manda vazio nesse caso.
            value={escolha}
            onChange={(e) => setEscolha(e.target.value)}
            className={campo}
            aria-label="Loja"
          >
            <option value="" disabled>
              Escolha a loja
            </option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.companyName}
              </option>
            ))}
            <option value={OUTRA}>Outra loja (digitar o nome)</option>
          </select>
        ) : null}
        <input type="hidden" name="clientId" value={digitarNome ? "" : escolha} />

        {digitarNome && (
          <input
            name="loja"
            placeholder="Nome da loja (ex: Jânio Multimarcas)"
            required
            className={campo}
          />
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Dia da gravação</span>
          <input
            type="date"
            name="data"
            required
            value={data}
            onChange={(e) => setData(e.target.value)}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Hora</span>
          <input type="time" name="hora" required defaultValue="09:00" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Quantos vídeos</span>
          <input
            type="number"
            name="quantidade"
            min={1}
            max={200}
            step={1}
            required
            defaultValue={1}
            inputMode="numeric"
            className={campo}
          />
        </label>
      </div>

      {/* O prazo é D+1 e o sistema já sabe. Só quem combinou outra data precisa
          abrir isso — assim o caminho normal é um campo a menos pra preencher. */}
      {prazoAberto ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Entregar em (outra data)</span>
          <input type="date" name="entrega" defaultValue={diaDaEntrega(data)} className={campo} />
        </label>
      ) : (
        <p className="text-xs text-foreground-muted">
          Entrega em <strong className="text-foreground">{diaCurto(diaDaEntrega(data))}</strong> (D+1).{" "}
          <button
            type="button"
            onClick={() => setPrazoAberto(true)}
            className="underline hover:text-foreground"
          >
            Combinei outra data
          </button>
        </p>
      )}

      <input name="observacao" placeholder="Observação (opcional)" className={campo} />

      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? <Video size={14} /> : <Plus size={14} />}
          {salvando ? "Salvando..." : "Registrar gravação"}
        </button>
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
            <Check size={13} /> Gravação registrada
          </span>
        )}
      </div>
    </form>
  );
}
