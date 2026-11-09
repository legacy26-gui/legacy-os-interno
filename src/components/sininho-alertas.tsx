import Link from "next/link";
import { Bell } from "lucide-react";
import { meusAlertas } from "@/lib/alertas/robo";
import { TOM_POR_NIVEL } from "@/lib/alertas/tipos";

// O sininho do cabeçalho: quantos alertas são meus e pedem ação agora.
//
// É componente de servidor próprio, dentro de um Suspense no cabeçalho, pra a
// conta dos alertas não atrasar o desenho da página. Se ela demorar, o
// sininho aparece depois; o resto do sistema não espera.

export async function SininhoAlertas() {
  const { ativos } = await meusAlertas();
  if (ativos.length === 0) return <Moldura quantos={0} />;

  // A bolinha pega a cor do pior alerta: de longe, a cor é a informação.
  const pior = ativos.reduce((p, a) => (a.nivel > p ? a.nivel : p), 1 as 1 | 2 | 3);
  const cor =
    TOM_POR_NIVEL[pior] === "amarelo"
      ? "bg-amber-500 text-black"
      : TOM_POR_NIVEL[pior] === "vermelho"
        ? "bg-red-500 text-white"
        : "bg-red-600 text-white";

  return <Moldura quantos={ativos.length} cor={cor} />;
}

function Moldura({ quantos, cor }: { quantos: number; cor?: string }) {
  return (
    <Link
      href="/alertas"
      aria-label={quantos === 0 ? "Alertas" : `${quantos} alertas pedindo ação`}
      title={quantos === 0 ? "Nenhum alerta" : `${quantos} pedindo ação`}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors text-foreground-muted"
    >
      <Bell size={16} />
      {quantos > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${cor}`}
        >
          {quantos > 99 ? "99+" : quantos}
        </span>
      )}
    </Link>
  );
}

/** O lugar do sininho enquanto a conta não volta — sem pulo de layout. */
export function SininhoVazio() {
  return <Moldura quantos={0} />;
}
