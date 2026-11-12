"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";

/**
 * Baixar o relatório como imagem.
 *
 * PNG e não PDF: o relatório vai no WhatsApp do dono da loja, e PDF vira um
 * anexo que pede aplicativo pra abrir. Imagem aparece na conversa.
 *
 * A imagem é gerada no servidor, então demora um instante — o botão diz isso
 * enquanto espera. Botão que não dá sinal de vida é botão apertado três
 * vezes, e aí são três imagens geradas.
 */
export function BotaoImagem({ endereco, nome }: { endereco: string; nome: string }) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setBaixando(true);
    setErro(null);
    try {
      const r = await fetch(endereco);
      if (!r.ok) {
        setErro(
          r.status === 409
            ? "Esta loja ainda não tem leitura da Meta."
            : `Não deu pra gerar a imagem (erro ${r.status}).`
        );
        return;
      }
      // Baixa pelo blob e não por um link direto: assim o navegador salva o
      // arquivo em vez de abrir a imagem numa aba, que é o que a pessoa quer
      // quando vai mandar no WhatsApp.
      const blob = await r.blob();
      const temporario = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = temporario;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(temporario);
    } catch {
      setErro("Não deu pra gerar a imagem.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={baixar}
        disabled={baixando}
        className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {baixando ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <ImageDown size={15} />
        )}
        {baixando ? "Gerando…" : "Baixar imagem"}
      </button>
      {erro && <p className="text-xs text-red-500">{erro}</p>}
    </div>
  );
}
