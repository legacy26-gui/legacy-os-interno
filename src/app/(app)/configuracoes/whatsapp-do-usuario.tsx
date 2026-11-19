"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { definirWhatsappDoUsuario } from "@/lib/actions/users";

// O WhatsApp de cada pessoa, direto na linha da tabela.
//
// ── Por que um campo e não uma tela de edição ────────────────────────────
//
// Porque é um dado só, preenchido uma vez por pessoa e quase nunca mexido.
// Uma tela de edição pra isso seria três cliques pra guardar doze dígitos.
//
// ── Por que ele mostra o que vai acontecer ───────────────────────────────
//
// "Fala com a IA" / "não fala" embaixo do campo, porque é essa a consequência
// de preencher — e ela não é óbvia olhando um número de telefone numa tabela
// de usuários. Sem a frase, alguém preencheria por organização e daria à
// pessoa um acesso que não pretendia dar.

export function WhatsappDoUsuario({
  userId,
  atual,
}: {
  userId: string;
  atual: string | null;
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();

  // O que está guardado, não o que está sendo digitado: a frase embaixo do
  // campo tem que descrever o estado do sistema, não a intenção de quem está
  // com o cursor no campo.
  const [guardado, setGuardado] = useState(atual);

  function salvar() {
    const limpo = valor.replace(/\D/g, "");
    if (limpo === (guardado ?? "")) return;
    setMsg({});
    comecar(async () => {
      const r = await definirWhatsappDoUsuario(userId, valor);
      setMsg(r);
      if (!r.erro) {
        setGuardado(limpo || null);
        setValor(limpo);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          setMsg({});
        }}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={pendente}
        placeholder="5542988126561"
        inputMode="tel"
        aria-label="WhatsApp desta pessoa"
        className="min-h-10 w-[11rem] px-2.5 rounded-lg border border-border bg-surface-muted
          text-sm font-mono disabled:opacity-50 focus:outline-none focus:border-accent"
      />
      {msg.erro ? (
        <span className="text-[11px] text-red-500">{msg.erro}</span>
      ) : msg.ok ? (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <Check size={11} /> {msg.ok}
        </span>
      ) : guardado ? (
        <span className="text-[11px] text-foreground-muted">
          Fala com a IA no privado
        </span>
      ) : (
        <span className="text-[11px] text-foreground-muted flex items-center gap-1">
          <X size={11} /> Não fala com a IA
        </span>
      )}
    </div>
  );
}
