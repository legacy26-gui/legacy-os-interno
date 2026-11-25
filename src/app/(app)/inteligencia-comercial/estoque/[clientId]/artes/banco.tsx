"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { apagarArte, atribuirArte, subirArte } from "@/lib/actions/artes";

type Arte = { id: string; nome: string; carroId: string | null; proporcao: string };

const campo = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

export function BancoDeArtes({ clientId, carros, artes }: { clientId: string; carros: { id: string; titulo: string }[]; artes: Arte[] }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const comArte = new Set(artes.map((a) => a.carroId).filter(Boolean));
  const semArte = carros.filter((c) => !comArte.has(c.id));

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const saida: string[] = [];
    for (const [i, f] of [...arquivos].entries()) {
      setEnviando(`Enviando ${i + 1} de ${arquivos.length}: ${f.name}`);
      const form = new FormData();
      form.set("clientId", clientId);
      form.set("arquivo", f);
      try {
        const r = await subirArte(form);
        saida.push(r.ok ? (r.carro ? `✓ ${f.name} → ${r.carro}` : `✓ ${f.name} — escolha o carro abaixo`) : `✗ ${r.erro}`);
      } catch {
        saida.push(`✗ ${f.name}: não subiu (arquivo maior que 6 MB?)`);
      }
    }
    setEnviando(null);
    setMsgs(saida);
    router.refresh();
  }

  const rodar = (f: () => Promise<{ ok?: string; erro?: string }>) =>
    comecar(async () => {
      const r = await f();
      setMsgs([r.ok ?? `✗ ${r.erro}`]);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <label className={`inline-flex w-fit items-center gap-2 px-4 min-h-11 rounded-lg border border-accent bg-accent/10 text-sm font-medium cursor-pointer ${enviando ? "opacity-50 pointer-events-none" : ""}`}>
        <Upload size={16} />
        {enviando ?? "Subir artes (pode escolher várias)"}
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
      </label>
      {msgs.length > 0 && (
        <ul className="text-sm rounded-lg border border-border p-3 flex flex-col gap-1">
          {msgs.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {artes.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhuma arte ainda.</p>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {artes.map((a) => (
            <div key={a.id} className={`rounded-xl border p-2 flex flex-col gap-2 ${a.carroId ? "border-border" : "border-amber-500"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/estoque/arte/${a.id}`} alt={a.nome} className="w-full rounded-lg bg-surface-muted object-contain max-h-64" />
              <div className="text-xs text-foreground-muted truncate" title={a.nome}>
                {a.nome} · {a.proporcao}
              </div>
              <select
                aria-label={`Carro da arte ${a.nome}`}
                disabled={pendente}
                value={a.carroId ?? ""}
                onChange={(e) => rodar(() => atribuirArte(clientId, a.id, e.target.value))}
                className={campo}
              >
                <option value="">— escolha o carro —</option>
                {carros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pendente}
                onClick={() => confirm(`Apagar a arte ${a.nome}?`) && rodar(() => apagarArte(clientId, a.id))}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline w-fit"
              >
                <Trash2 size={12} /> Apagar
              </button>
            </div>
          ))}
        </div>
      )}

      {semArte.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-foreground-muted">{semArte.length} carro(s) do site sem arte (usam só as fotos do site)</summary>
          <ul className="mt-2 list-disc pl-5">
            {semArte.map((c) => (
              <li key={c.id}>{c.titulo}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
