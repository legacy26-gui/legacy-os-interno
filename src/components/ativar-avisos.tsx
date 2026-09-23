"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

// Botão que liga o aviso de lead novo neste aparelho. A permissão é por
// aparelho e por navegador — quem quiser receber no celular precisa apertar
// isso no celular, com o app instalado.

type Estado = "carregando" | "indisponivel" | "desligado" | "ligado" | "bloqueado";

// A chave VAPID vem em base64url e o navegador quer bytes.
function paraBytes(base64: string) {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bruto = atob(preenchido);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

export function AtivarAvisos() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [chave, setChave] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (vivo) setEstado("indisponivel");
        return;
      }

      const r = await fetch("/api/push/inscrever").then((r) => r.json()).catch(() => null);
      if (!vivo) return;
      if (!r?.configurado || !r.chavePublica) {
        setEstado("indisponivel");
        return;
      }
      setChave(r.chavePublica);

      if (Notification.permission === "denied") {
        setEstado("bloqueado");
        return;
      }

      const registro = await navigator.serviceWorker.ready.catch(() => null);
      const inscricao = await registro?.pushManager.getSubscription();
      if (vivo) setEstado(inscricao ? "ligado" : "desligado");
    })();

    return () => {
      vivo = false;
    };
  }, []);

  async function ligar() {
    if (!chave) return;
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: paraBytes(chave),
      });

      const r = await fetch("/api/push/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      setEstado(r.ok ? "ligado" : "desligado");
    } catch {
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await fetch(`/api/push/inscrever?endpoint=${encodeURIComponent(inscricao.endpoint)}`, {
          method: "DELETE",
        });
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "indisponivel") return null;

  if (estado === "bloqueado") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-foreground-muted"
        title="Você bloqueou as notificações para este site. Libere nas configurações do navegador."
      >
        <BellOff size={14} /> Avisos bloqueados
      </span>
    );
  }

  const ligado = estado === "ligado";

  return (
    <button
      type="button"
      onClick={ligado ? desligar : ligar}
      disabled={ocupado}
      title={
        ligado
          ? "Você recebe aviso de lead novo neste aparelho. Toque para desligar."
          : "Receber aviso no celular quando entrar lead novo"
      }
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60 ${
        ligado
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          : "border-border text-foreground-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {ligado ? <BellRing size={14} /> : <Bell size={14} />}
      {ocupado ? "..." : ligado ? "Avisos ligados" : "Receber avisos"}
    </button>
  );
}
