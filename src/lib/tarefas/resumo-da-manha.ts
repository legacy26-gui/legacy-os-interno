import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA } from "@/lib/carteira";
import { diaDaCasaComoData, segundaDaSemana } from "@/lib/dia-da-casa";
import { ehIgor } from "@/lib/permissions";
import { montarPainelDoDia } from "@/lib/meta/painel-do-dia";
import { AVISOS_DE_CANSACO_LIGADOS } from "@/lib/meta/criativo-cansado";

// O que entra na mensagem das 8h30, além das tarefas (ver robo.ts):
//
//   • gestora (quem tem carteira): o resumo da carteira dela — lojas pra conferir, verba, relatórios da semana.
//   • Igor: as gravações e entregas do dia, com o jeito de marcar "enviei" (que avisa o gestor da loja).
//
// Tudo DETERMINÍSTICO: os mesmos números do Meu Dia (montarPainelDoDia), escritos em frase. Nenhuma IA entra aqui,
// então nenhum número pode sair inventado.

const lista = (nomes: string[], max = 5) => (nomes.length <= max ? nomes.join(", ") : `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`);
const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** O resumo da carteira de uma gestora, ou null se ela não tem loja. */
export async function resumoDaGestora(userId: string, agora: Date): Promise<string | null> {
  const clientes = await prisma.client.findMany({
    where: { ...CARTEIRA, managerId: userId },
    select: { id: true, companyName: true, metaAdAccounts: { where: { active: true }, select: { id: true } } },
    orderBy: { companyName: "asc" },
  });
  if (clientes.length === 0) return null;

  const painel = await montarPainelDoDia(clientes.map((c) => c.id), agora);
  const cobrancaVencida = painel.lojas.filter((l) => l.veredito.pedido === "vencido");
  const semSaldo = painel.lojas.filter((l) => (l.veredito.tom === "sem-saldo" || l.veredito.tom === "acabando") && l.veredito.pedido !== "vencido");
  const aguardando = painel.lojas.filter((l) => l.veredito.tom === "aguardando");
  const acelerado = painel.lojas.filter((l) => l.projecao.ritmo === "acelerado");
  const parado = painel.lojas.filter((l) => l.projecao.ritmo === "parado");
  const artes = AVISOS_DE_CANSACO_LIGADOS ? painel.criativos.filter((c) => c.diagnostico.estado === "cansado") : [];

  const linhas: string[] = [`🏪 *Sua carteira:* ${clientes.length} ${clientes.length === 1 ? "loja" : "lojas"} pra conferir hoje no Meu Dia.`];

  const verba: string[] = [];
  for (const l of cobrancaVencida) verba.push(`• ${l.nome} — cobrei o Pix e não veio`);
  for (const l of semSaldo) verba.push(`• ${l.nome} — ${l.veredito.tom === "sem-saldo" ? "sem saldo" : l.diasDeSaldo ? `saldo pra ${l.diasDeSaldo}` : "saldo acabando"}`);
  if (aguardando.length) verba.push(`• ${aguardando.length === 1 ? "1 loja esperando" : `${aguardando.length} lojas esperando`} a verba cair (${lista(aguardando.map((l) => l.nome), 3)})`);
  if (acelerado.length) verba.push(`• gastando acima do combinado: ${lista(acelerado.map((l) => l.nome), 4)}`);
  if (parado.length) verba.push(`• verba sobrando: ${lista(parado.map((l) => l.nome), 4)}`);
  linhas.push(verba.length ? `\n💰 *Verba:*\n${verba.join("\n")}` : `\n💰 *Verba:* nenhum alerta. ✅`);

  if (artes.length) linhas.push(`\n🎨 *Artes cansadas:* ${artes.length} (${lista([...new Set(artes.map((a) => a.loja))], 4)})`);

  // Relatórios da semana: só lojas com conta de anúncio (sem conta não há número pra mandar).
  const comConta = clientes.filter((c) => c.metaAdAccounts.length > 0);
  if (comConta.length) {
    const semana = segundaDaSemana(agora);
    const enviados = new Set((await prisma.relatorioEnviado.findMany({ where: { semana, clientId: { in: comConta.map((c) => c.id) } }, select: { clientId: true } })).map((e) => e.clientId));
    const faltam = comConta.filter((c) => !enviados.has(c.id));
    const dow = diaDaCasaComoData(agora).getUTCDay(); // 1 = segunda
    if (faltam.length === 0) linhas.push(`\n📊 *Relatórios da semana:* todos enviados. ✅`);
    else if (dow === 1) linhas.push(`\n📊 *Relatórios:* hoje é dia — ${faltam.length} ${faltam.length === 1 ? "loja" : "lojas"} (o robô manda; depois confira no Meu Dia).`);
    else linhas.push(`\n📊 *Relatórios da semana ainda pendentes (${faltam.length}):* ${lista(faltam.map((c) => c.companyName), 6)}`);
  }
  return linhas.join("\n");
}

/** As gravações e entregas do dia do Igor, ou null se não há nada. */
export async function resumoDoIgor(agora: Date): Promise<string | null> {
  const hoje = diaDaCasaComoData(agora);
  const amanha = new Date(hoje.getTime() + 86_400_000);
  const inicioBr = new Date(hoje.getTime() + 3 * 3600_000); // meia-noite de Brasília em UTC
  const [aEntregar, gravacoesDeHoje] = await Promise.all([
    prisma.gravacao.findMany({
      where: { entregueEm: null, entregaEm: { lt: amanha } },
      select: { loja: true, quantidade: true, gravadoEm: true, entregaEm: true },
      orderBy: { entregaEm: "asc" },
    }),
    prisma.gravacao.findMany({
      where: { gravadoEm: { gte: inicioBr, lt: new Date(inicioBr.getTime() + 86_400_000) } },
      select: { loja: true, quantidade: true, gravadoEm: true },
      orderBy: { gravadoEm: "asc" },
    }),
  ]);
  if (aEntregar.length === 0 && gravacoesDeHoje.length === 0) return null;

  const q = (n: number) => `${n} ${n === 1 ? "carro" : "carros"}`;
  const partes: string[] = [];
  if (gravacoesDeHoje.length) {
    const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    partes.push(`🎥 *Gravações de hoje:*\n${gravacoesDeHoje.map((g) => `• ${g.loja} — ${q(g.quantidade)} (${hora(g.gravadoEm)})`).join("\n")}`);
  }
  if (aEntregar.length) {
    partes.push(
      `📦 *Entregas pra mandar:*\n${aEntregar
        .map((g) => {
          const atrasada = g.entregaEm.getTime() < hoje.getTime();
          return `• ${g.loja} — ${q(g.quantidade)} (gravada ${dd(new Date(g.gravadoEm.getTime() - 3 * 3600_000))})${atrasada ? " — ⚠️ atrasada" : " — pra hoje"}`;
        })
        .join("\n")}`,
    );
  }
  partes.push(`Quando mandar, responde *enviei os vídeos da Vilela* (com o nome da loja) que eu dou baixa e aviso o gestor de tráfego dela.`);
  return partes.join("\n\n");
}

/** O que entra na mensagem das 8h30 de uma pessoa, além das tarefas. */
export async function extrasDaManha(userId: string, agora: Date): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!u) return null;
  const partes: string[] = [];
  const g = await resumoDaGestora(userId, agora);
  if (g) partes.push(g);
  if (ehIgor(u.email)) {
    const i = await resumoDoIgor(agora);
    if (i) partes.push(i);
  }
  return partes.length ? partes.join("\n\n") : null;
}
