import { CheckCircle2, XCircle, AlertTriangle, Radio } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { metaConfigurada, pixelId } from "@/lib/meta-capi";
import { formatDateTime } from "@/lib/labels";

// Painel de "a Meta está recebendo?" dentro do sistema. Existe porque envio de
// evento é invisível: sem isso só se descobre que parou quando o anúncio já
// está otimizando errado — e a alternativa era montar URL com senha na mão.

const NOMES: Record<string, string> = {
  Lead: "Lead novo",
  QualifiedLead: "Lead qualificado",
  Purchase: "Virou cliente",
};

// Traduz o erro da Meta pra algo que dá pra agir.
function explicar(resposta: string | null) {
  const t = (resposta ?? "").toLowerCase();
  if (t.includes("access token") || t.includes("oauth") || t.includes("session has expired")) {
    return "O token da Meta está inválido ou venceu. Gere outro no Gerenciador de Eventos e troque na Vercel.";
  }
  if (t.includes("permission") || t.includes("(#200)")) {
    return "O token não tem permissão pra mandar evento neste Pixel. Confira se ele foi gerado pro conjunto certo.";
  }
  if (t.includes("does not exist") || t.includes("unsupported get request")) {
    return "A Meta não encontrou este Pixel. Confira o ID do conjunto de dados.";
  }
  if (t.includes("fetch failed") || t.includes("timeout") || t.includes("aborted")) {
    return "Não deu pra falar com a Meta nessa hora (rede). Dá pra tentar de novo.";
  }
  return null;
}

export async function StatusMeta() {
  const configurada = metaConfigurada();

  const [envios, comRastro] = await Promise.all([
    prisma.metaCapiEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        eventName: true,
        sucesso: true,
        resposta: true,
        createdAt: true,
        lead: { select: { companyName: true } },
      },
    }),
    prisma.lead.count({
      where: { OR: [{ fbc: { not: null } }, { fbp: { not: null } }, { fbclid: { not: null } }] },
    }),
  ]);

  const ultimaFalha = envios.find((e) => !e.sucesso);

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Radio size={15} className="text-foreground-muted" /> Conexão com a Meta
        </p>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
            configurada ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
          }`}
        >
          {configurada ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {configurada ? "Ligada" : "Falta o token"}
        </span>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {!configurada ? (
          <p className="text-sm text-foreground-muted">
            O token da Meta ainda não está configurado na Vercel (variável{" "}
            <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">META_CAPI_TOKEN</code>). Sem ele
            os leads continuam entrando normalmente — só não sai aviso pra Meta, e o anúncio segue otimizando
            por formulário preenchido em vez de por venda.
          </p>
        ) : (
          <p className="text-sm text-foreground-muted">
            Conjunto de dados <span className="text-foreground font-medium">{pixelId()}</span> ·{" "}
            {comRastro} lead(s) com rastro de anúncio.
          </p>
        )}

        {envios.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nenhum evento enviado ainda. O primeiro sai quando entrar um lead da landing que tenha vindo de
            anúncio.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border -mx-5">
            {envios.map((e, i) => (
              <div key={i} className="px-5 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    <span className="font-medium">{NOMES[e.eventName] ?? e.eventName}</span>
                    <span className="text-foreground-muted"> · {e.lead.companyName}</span>
                  </p>
                  <p className="text-xs text-foreground-muted">{formatDateTime(e.createdAt)}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                    e.sucesso ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {e.sucesso ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {e.sucesso ? "recebido" : "falhou"}
                </span>
              </div>
            ))}
          </div>
        )}

        {ultimaFalha && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 flex flex-col gap-1.5">
            <p className="text-sm font-medium text-red-500">O que a Meta respondeu no último erro</p>
            {explicar(ultimaFalha.resposta) && (
              <p className="text-sm">{explicar(ultimaFalha.resposta)}</p>
            )}
            <p className="text-xs text-foreground-muted break-all">
              {ultimaFalha.resposta?.slice(0, 400) ?? "sem detalhe"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
