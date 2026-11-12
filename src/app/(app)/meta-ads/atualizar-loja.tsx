"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { atualizarLojaAgora } from "@/lib/actions/meta-ads";

/**
 * O botão de atualizar UMA loja, na linha dela.
 *
 * É só um ícone: numa lista de quarenta linhas, quarenta botões escritos
 * viram parede. O ícone fica discreto até alguém precisar dele.
 *
 * O erro aparece embaixo da linha, não some sozinho: quem apertou precisa
 * saber se funcionou, e um aviso que pisca e some é o mesmo que não avisar.
 */
export function AtualizarLoja({ clientId, nome }: { clientId: string; nome: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pendente}
        title={`Buscar saldo e números de ${nome} na Meta agora`}
        aria-label={`Atualizar ${nome}`}
        onClick={() =>
          comecar(async () => {
            const r = await atualizarLojaAgora(clientId);
            setErro(r.erro ?? null);
          })
        }
        className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-muted disabled:opacity-60"
      >
        <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
      </button>
      {erro && <p className="text-xs text-red-500 mt-1 max-w-xs">{erro}</p>}
    </>
  );
}
