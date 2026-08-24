import { Sparkles } from "lucide-react";
import { carregarAnalises, type AnaliseParaTela, type ParDeAnalises } from "@/lib/ai/diagnostico";
import { DiagnosticoPanel, type AnaliseSerializada, type ParSerializado } from "./diagnostico-panel";

// Datas não atravessam a fronteira servidor→cliente como Date sem virar string,
// então a conversão acontece aqui, num lugar só.
function serializar(a: AnaliseParaTela | null): AnaliseSerializada | null {
  if (!a) return null;
  return {
    id: a.id,
    kind: a.kind,
    version: a.version,
    status: a.status,
    model: a.model,
    promptVersion: a.promptVersion,
    error: a.error,
    createdAt: a.createdAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    diagnostico: a.diagnostico,
  };
}

export async function DiagnosticoSection({
  onboardingId,
  meetingNotes,
  titulo = "Diagnóstico e Plano de Ação",
  subtitulo,
  iniciaAberto = false,
}: {
  onboardingId: string;
  meetingNotes: string | null;
  titulo?: string;
  subtitulo?: string;
  iniciaAberto?: boolean;
}) {
  const { pre, final } = await carregarAnalises(onboardingId);
  const par = (p: ParDeAnalises): ParSerializado => ({
    ultima: serializar(p.ultima),
    concluida: serializar(p.concluida),
  });

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles size={15} className="text-accent" /> {titulo}
        </h2>
        <p className="text-xs text-foreground-muted mt-0.5">
          {subtitulo ??
            "Gerado por IA a partir das respostas do formulário. Abra pra ver resumo, gargalos e plano de ação."}
        </p>
      </div>

      <DiagnosticoPanel
        onboardingId={onboardingId}
        pre={par(pre)}
        final={par(final)}
        meetingNotes={meetingNotes}
        iniciaAberto={iniciaAberto}
      />
    </div>
  );
}
