import { Inbox, AlertTriangle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";

// Saúde do formulário da landing.
//
// Responde a pergunta que não tinha resposta no dia em que cinco leads sumiram:
// as chamadas chegaram? "tentativas_lead" registra TODA requisição que passou
// pelo Origin, antes de qualquer validação — então ela é a prova de que a
// landing postou. Comparando com os leads criados, aparece o buraco.
//
// Observação: registro de tentativa é apagado depois de 24h (serve pro limite
// por IP), então a comparação vale pro último dia.

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
  const umDia = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [chegaram, viraramLead, recusadosDia, recusados, total] = await Promise.all([
    // Toda chamada que passou pelo Origin — inclusive as que foram recusadas
    // depois. É o "bateu na porta".
    prisma.tentativaLead.count({ where: { createdAt: { gte: umDia } } }),
    prisma.lead.count({ where: { createdAt: { gte: umDia }, notes: { contains: "landing" } } }),
    prisma.leadRecusado.count({ where: { createdAt: { gte: umDia } } }),
    prisma.leadRecusado.findMany({
      where: { createdAt: { gte: trintaDias } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.leadRecusado.count({ where: { createdAt: { gte: trintaDias } } }),
  ]);

  // Chegou e não virou lead nem recusa registrada = perdido antes da caixa
  // preta existir. Só aparece enquanto houver esse caso.
  const semExplicacao = Math.max(0, chegaram - viraramLead - recusadosDia);

  if (chegaram === 0 && total === 0) return null;

  const temProblema = total > 0 || semExplicacao > 0;

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        temProblema ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-surface"
      }`}
    >
      <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between gap-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Inbox size={15} className={temProblema ? "text-amber-500" : "text-foreground-muted"} />
          Formulário da landing
        </p>
        {total > 0 && (
          <span className="text-xs font-semibold text-amber-500">{total} recusados em 30 dias</span>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/50 border-b border-border/50">
        <Numero rotulo="Chegaram (24h)" valor={chegaram} dica="requisições que bateram no endpoint" />
        <Numero rotulo="Viraram lead" valor={viraramLead} tom="emerald" />
        <Numero
          rotulo="Não viraram"
          valor={recusadosDia + semExplicacao}
          tom={recusadosDia + semExplicacao > 0 ? "amber" : undefined}
        />
      </div>

      {chegaram === 0 ? (
        <div className="px-5 py-4 text-sm">
          <p className="font-medium">Nenhuma chamada chegou no endpoint nas últimas 24 horas.</p>
          <p className="text-foreground-muted mt-1">
            Se alguém preencheu o formulário nesse período, o envio não saiu da landing — o problema está lá
            (endereço errado, JavaScript com erro, ou o navegador bloqueando antes de mandar), não aqui.
          </p>
        </div>
      ) : (
        <div className="px-5 py-3 text-sm text-foreground-muted flex items-start gap-2">
          {semExplicacao > 0 ? (
            <>
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">{semExplicacao} envio(s) chegaram e não viraram lead</strong>{" "}
                sem registro do motivo — foram recusados antes desta tela existir. Daqui pra frente, todo envio
                que não virar lead aparece embaixo com o que a pessoa digitou.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>Tudo que chegou nas últimas 24 horas está explicado.</span>
            </>
          )}
        </div>
      )}

      {recusados.length > 0 && (
        <div className="flex flex-col divide-y divide-border/50 border-t border-border/50">
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
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  tom,
  dica,
}: {
  rotulo: string;
  valor: number;
  tom?: "emerald" | "amber";
  dica?: string;
}) {
  const cor = tom === "emerald" ? "text-emerald-500" : tom === "amber" ? "text-amber-500" : "";
  return (
    <div className="px-5 py-3">
      <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">{rotulo}</p>
      <p className={`text-xl font-semibold ${cor}`}>{valor}</p>
      {dica && <p className="text-[11px] text-foreground-muted mt-0.5">{dica}</p>}
    </div>
  );
}
