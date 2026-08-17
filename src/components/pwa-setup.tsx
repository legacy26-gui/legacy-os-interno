"use client";

import { useEffect, useState } from "react";
import { Share, Plus, X } from "lucide-react";

// Registra o service worker (necessário pro app ser instalável) e, no iPhone,
// explica como instalar — o Safari não tem prompt automático de instalação.
export function PwaSetup() {
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Falha no registro não pode atrapalhar o uso normal do sistema.
      });
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const jaDispensou = localStorage.getItem("legacyos_ios_hint") === "off";

    if (isIOS && !isStandalone && !jaDispensou) setShowIosHint(true);
  }, []);

  if (!showIosHint) return null;

  return (
    <div className="fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 md:hidden rounded-xl border border-border bg-surface shadow-lg p-4 flex items-start gap-3">
      <div className="flex-1 text-sm">
        <p className="font-medium">Instalar o Legacy OS</p>
        <p className="text-foreground-muted text-xs mt-1 flex items-center gap-1 flex-wrap">
          Toque em <Share size={13} className="inline" /> e depois em
          <span className="inline-flex items-center gap-1">
            <Plus size={13} /> &quot;Adicionar à Tela de Início&quot;
          </span>
        </p>
      </div>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => {
          localStorage.setItem("legacyos_ios_hint", "off");
          setShowIosHint(false);
        }}
        className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}
