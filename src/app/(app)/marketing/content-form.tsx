"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createContentItem } from "@/lib/actions/content";
import { CONTENT_STATUS_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

const PLATFORMS = ["instagram", "facebook", "whatsapp", "tiktok", "youtube"];
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function ContentForm({ clients }: { clients: { id: string; companyName: string }[] }) {
  const [state, formAction, pending] = useActionState(createContentItem, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input name="title" placeholder="Título" required className={inputClass} />
        <select name="clientId" className={inputClass} defaultValue="">
          <option value="">Cliente (opcional)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
        <input name="scheduledDate" type="date" className={inputClass} title="Data de publicação" />
        <select name="status" defaultValue="IDEIA" className={inputClass}>
          {Object.entries(CONTENT_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-3">
        {PLATFORMS.map((p) => (
          <label key={p} className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <input type="checkbox" name="platforms" value={p} className="accent-accent" />
            {PLATFORM_LABELS[p]}
          </label>
        ))}
      </div>
      <textarea name="description" rows={2} placeholder="Descrição / roteiro..." className={inputClass} />
      <input name="mediaUrl" placeholder="Link da arte/vídeo (opcional)" className={inputClass} />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Novo conteúdo"}
      </button>
    </form>
  );
}
