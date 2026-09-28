import { Inbox, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";

// Envios da landing que não viraram lead. Existe porque lead perdido some sem
// deixar rastro: o Pixel conta o envio e o CRM não recebe nada. Aqui fica o que
// a pessoa digitou, pra ligar pra ela na mão em vez de perder o contato.

const EXPLICACAO: { quando: (m: string) => boolean; texto: string }[] = [
  {
    quando: (m) => m.includes("origem não autorizada"),
    texto:
      "O envio veio de um endereço que não está liberado. Se a landing mudou de domínio, é preciso liberar o novo.",
  },
  {
    quando: (m) => m.includes("limite de envios"),
    texto: "Mais de 5 envios do mesmo IP em 10 minutos. Costuma ser teste ou robô.",
  },
  {
    quando: (m) => m.includes("corpo ilegível"),
    texto: "A landing mandou o formulário num formato que o sistema não entendeu.",
  },
  {
    quando: (m) => m.includes("whatsapp"),
    texto: "O WhatsApp veio faltando ou fora do formato (precisa de DDD + número).",
  },
  {
    quando: (m) => m.includes("falha ao gravar"),
    texto: "O banco recusou a gravação. Vale conferir se o serviço estava fora do ar nesse horário.",
  },
];

export async function EnviosRecusados() {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recusados, total] = await Promise.all([
    prisma.leadRecusado.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.leadRecusado.count({ where: { createdAt: { gte: desde } } }),
  ]);

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-500/20 flex items-center justify-between gap-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Inbox size={15} className="text-amber-500" /> Envios da landing que não viraram lead
        </p>
        <span className="text-xs font-semibold text-amber-500">{total} nos últimos 30 dias</span>
      </div>

      <div className="px-5 py-3 text-sm text-foreground-muted border-b border-amber-500/20">
        Alguém preencheu o formulário e o cartão não chegou no funil. O que a pessoa digitou está guardado
        aqui — dá pra ligar pra ela na mão.
      </div>

      <div className="flex flex-col divide-y divide-amber-500/15">
        {recusados.map((r) => {
          const explicacao = EXPLICACAO.find((e) => e.quando(r.motivo))?.texto;
          return (
            <div key={r.id} className="px-5 py-3 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                  {r.motivo}
                </p>
                <span className="text-xs text-foreground-muted shrink-0">{formatDateTime(r.createdAt)}</span>
              </div>
              {explicacao && <p className="text-xs text-foreground-muted">{explicacao}</p>}
              <p className="text-[11px] text-foreground-muted break-all bg-surface-muted/50 rounded-lg px-2.5 py-2">
                {r.corpo.slice(0, 400)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
