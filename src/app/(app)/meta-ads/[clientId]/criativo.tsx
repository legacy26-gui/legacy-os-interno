"use client";

import { useState } from "react";
import { ImageOff, ExternalLink } from "lucide-react";

// A miniatura do anúncio.
//
// O endereço vem da CDN da Meta e EXPIRA. Por isso isto é componente de
// navegador e não uma tag solta: quando a imagem não carrega, o lugar dela
// vira um quadrinho neutro em vez de um ícone de foto quebrada, que parece
// defeito do sistema.
//
// A imagem é buscada pelo navegador direto na Meta — ela fica sabendo que
// alguém olhou. São os anúncios da própria agência, então não é segredo pra
// ninguém; mas é bom estar dito.
//
// <img> e não o componente de imagem do Next de propósito: o do Next quer a
// lista de domínios permitidos no arquivo de configuração, e a CDN da Meta
// muda de subdomínio. Miniatura de 44px não ganha nada sendo otimizada.

export function Criativo({
  url,
  preview,
  nome,
}: {
  url: string | null;
  preview: string | null;
  nome: string;
}) {
  const [quebrou, setQuebrou] = useState(false);

  const quadro = (
    <span className="w-11 h-11 rounded-lg border border-border bg-surface-muted flex items-center justify-center overflow-hidden shrink-0">
      {url && !quebrou ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Criativo de ${nome}`}
          width={44}
          height={44}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setQuebrou(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <ImageOff size={15} className="text-foreground-muted" />
      )}
    </span>
  );

  if (!preview) return quadro;

  return (
    <a
      href={preview}
      target="_blank"
      rel="noopener noreferrer"
      title={`Ver "${nome}" na Meta`}
      className="relative group shrink-0"
    >
      {quadro}
      <span className="absolute -bottom-1 -right-1 bg-surface border border-border rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={9} className="text-foreground-muted" />
      </span>
    </a>
  );
}
