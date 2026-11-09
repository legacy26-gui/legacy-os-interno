import { Bell } from "lucide-react";
import { meusAlertas } from "@/lib/alertas/robo";
import { PainelAlertas } from "@/components/painel-alertas";

// O sininho do cabeçalho.
//
// Busca os alertas da pessoa no servidor e entrega pro painel, que é de
// navegador porque precisa abrir e fechar. Assim a lista não vem de uma
// chamada extra depois que a página carrega: já vem pronta com ela.
//
// Fica dentro de um Suspense no cabeçalho pra a conta dos alertas não atrasar
// o desenho da página em toda navegação do sistema.

/** Quantos cabem no painel antes de "ver todos". */
const NO_PAINEL = 8;

export async function SininhoAlertas() {
  const { ativos } = await meusAlertas();
  // Só o necessário atravessa pro navegador — nada de alerta de ninguém mais.
  return <PainelAlertas alertas={ativos.slice(0, NO_PAINEL)} total={ativos.length} />;
}

/** O lugar do sininho enquanto a conta não volta — sem pulo de layout. */
export function SininhoVazio() {
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-muted text-foreground-muted">
      <Bell size={16} />
    </span>
  );
}
