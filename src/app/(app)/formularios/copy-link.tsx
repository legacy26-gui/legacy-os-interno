"use client";

import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, MessageCircle } from "lucide-react";

// O link precisa ser o endereço real de onde o sistema está aberto (produção ou
// localhost), por isso é montado no navegador e não no servidor.
export function CopyLink() {
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => setUrl(`${window.location.origin}/formulario`), []);

  const mensagem = `Oi! Pra começarmos sua operação aqui na Legacy, responde esse formulário rapidinho: ${url}`;

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <code className="flex-1 min-w-0 truncate text-xs bg-surface-muted border border-border rounded-lg px-3 py-2.5">
        {url || "…"}
      </code>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90"
        >
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-border hover:bg-surface-muted"
        >
          <MessageCircle size={14} /> WhatsApp
        </a>
        <a
          href="/formulario"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 rounded-lg border border-border hover:bg-surface-muted"
        >
          <ExternalLink size={14} /> Abrir
        </a>
      </div>
    </div>
  );
}
