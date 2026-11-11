import "server-only";
import { prisma } from "@/lib/prisma";
import { CARTEIRA } from "@/lib/carteira";
import { estadoDaVenda, diasEntre, type TomDaVenda } from "@/lib/controle-vendas";
import { TOTAL_DE_ETAPAS } from "@/lib/etapas-implantacao";
import { formatCurrency } from "@/lib/labels";
import type { Alerta, NivelDeAlerta } from "./tipos";

// De onde cada alerta nasce.
//
// A decisão que manda neste arquivo: **alerta não é linha gravada, é pergunta
// feita ao banco.** Nada de uma tabela de alertas que alguém precisa criar,
// atualizar e apagar — isso dá alerta fantasma (o problema já foi resolvido e
// o aviso continua lá) e alerta perdido (o problema nasceu e ninguém gravou).
// Aqui o alerta existe enquanto o problema existir, e desaparece no instante
// em que a gravação for entregue, a loja vender, a mensalidade cair. Ninguém
// precisa dar baixa em nada.
//
// O que fica gravado no banco é só o que o banco não sabe sozinho: o que já
// foi pro celular de quem, e o que a pessoa pediu pra lembrar depois.

/** Meia-noite de hoje em UTC — o começo do dia, pra comparar por dia inteiro. */
function inicioDeHoje(hoje: Date): Date {
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
}

function diaCurto(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${muitos}`;
}

// ───────────────────────────── Loja sem vender ─────────────────────────────
//
// A mesma conta do Controle de Vendas, e de propósito: a tela e o alerta não
// podem discordar. Se um dia a escada de dias mudar lá, muda aqui junto,
// porque o cálculo vem de controle-vendas.ts e não é copiado.

const NIVEL_DA_VENDA: Partial<Record<TomDaVenda, NivelDeAlerta>> = {
  amarelo: 1,
  vermelho: 2,
  critico: 3,
};

async function lojasSemVender(hoje: Date): Promise<Alerta[]> {
  const [lojas, ultimas] = await Promise.all([
    prisma.client.findMany({
      // Mesmo filtro da tela: carteira e dentro do controle. Quem o Guilherme
      // tirou do controle (consórcio, banco) não gera alerta — era justamente
      // pra parar de aparecer no vermelho pra sempre.
      where: { ...CARTEIRA, controlaVendas: true },
      select: { id: true, companyName: true, startDate: true, createdAt: true, managerId: true },
    }),
    prisma.clientSale.groupBy({ by: ["clientId"], _max: { soldAt: true } }),
  ]);

  const ultimaPorLoja = new Map(ultimas.map((u) => [u.clientId, u._max.soldAt]));

  return lojas.flatMap((l) => {
    // Sem venda nenhuma a conta parte de quando a loja entrou: quem fechou
    // ontem não pode nascer no vermelho por ainda não ter vendido.
    const estado = estadoDaVenda(ultimaPorLoja.get(l.id) ?? null, l.startDate ?? l.createdAt, hoje);
    const nivel = NIVEL_DA_VENDA[estado.tom];
    if (!nivel) return []; // verde: vendendo, não é alerta

    return [
      {
        chave: `venda-parada:${l.id}`,
        tipo: "venda-parada" as const,
        empresa: "AGENCIA" as const,
        titulo: l.companyName,
        detalhe: estado.nuncaVendeu
          ? `Nunca registrou venda — entrou há ${estado.dias} dias`
          : `${estado.dias} dias sem vender`,
        nivel,
        link: "/controle-vendas",
        modulo: "gestao-contas" as const,
        dias: estado.dias,
        // O gestor da loja também é avisado — ver destinatarios.ts.
        donoId: l.managerId,
      },
    ];
  });
}

// ───────────────────────────── Gravação atrasada ────────────────────────────
//
// A regra da casa é D+1: gravou hoje, entrega amanhã. Então "atrasada" é o dia
// da entrega já ter passado sem ninguém marcar a entrega.

function nivelDoAtraso(dias: number): NivelDeAlerta {
  if (dias >= 7) return 3;
  if (dias >= 3) return 2;
  return 1;
}

async function gravacoesAtrasadas(hoje: Date): Promise<Alerta[]> {
  const hoje0 = inicioDeHoje(hoje);
  const atrasadas = await prisma.gravacao.findMany({
    where: { entregueEm: null, entregaEm: { lt: hoje0 } },
    select: { id: true, empresa: true, loja: true, quantidade: true, entregaEm: true },
    orderBy: { entregaEm: "asc" },
    // Trava de sanidade: se um dia houver centenas de gravações antigas sem
    // baixa, é problema de dado e não vinte avisos no celular de alguém.
    take: 100,
  });

  return atrasadas.map((g) => {
    const dias = diasEntre(g.entregaEm, hoje0);
    return {
      chave: `gravacao-atrasada:${g.id}`,
      tipo: "gravacao-atrasada" as const,
      empresa: g.empresa,
      titulo: g.loja,
      detalhe: `${plural(g.quantidade, "vídeo", "vídeos")} — entrega era ${diaCurto(g.entregaEm)}, ${plural(dias, "dia", "dias")} de atraso`,
      nivel: nivelDoAtraso(dias),
      link: "/gravacoes",
      modulo: "gravacoes" as const,
      dias,
    };
  });
}

// ──────────────────────────── Mensalidade vencida ───────────────────────────

/**
 * Até onde olhar pra trás. Mensalidade vencida há meio ano não é alerta de
 * hoje — é faxina de cadastro, e entulharia a tela de quem precisa agir agora.
 */
const JANELA_DE_COBRANCA_DIAS = 90;

async function mensalidadesVencidas(hoje: Date): Promise<Alerta[]> {
  const hoje0 = inicioDeHoje(hoje);
  const limite = new Date(hoje0.getTime() - JANELA_DE_COBRANCA_DIAS * 86_400_000);

  const vencidas = await prisma.revenue.findMany({
    where: {
      status: { not: "PAGO" },
      dueDate: { lt: hoje0, gte: limite },
    },
    select: {
      id: true,
      empresa: true,
      description: true,
      value: true,
      dueDate: true,
      client: { select: { companyName: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  return vencidas.map((r) => {
    const dias = diasEntre(r.dueDate, hoje0);
    return {
      chave: `mensalidade-vencida:${r.id}`,
      tipo: "mensalidade-vencida" as const,
      empresa: r.empresa,
      // Entrada sem cliente na carteira existe (curso do Treinamentos, entrada
      // avulsa da agência): nesse caso quem identifica é a descrição.
      titulo: r.client?.companyName ?? r.description,
      detalhe: `${formatCurrency(Number(r.value))} — venceu ${diaCurto(r.dueDate)}, ${plural(dias, "dia", "dias")} em atraso`,
      nivel: nivelDoAtraso(dias),
      link: "/financeiro",
      modulo: "financeiro" as const,
      dias,
    };
  });
}

// ─────────────────────────── Implantação parada ─────────────────────────────
//
// O pedido do Guilherme: avisar sobre o cliente novo que ainda não terminou o
// início. Não é "chegou ficha nova" — é "a ficha está aberta e ninguém mexeu".
// Ficha preenchida hoje não é alerta; ficha preenchida e esquecida, é.

/** Dias sem ninguém marcar etapa até isso virar alerta. */
const DIAS_PARADA = 3;

async function implantacoesParadas(hoje: Date): Promise<Alerta[]> {
  const hoje0 = inicioDeHoje(hoje);
  const fichas = await prisma.clientOnboarding.findMany({
    // Concluída sai: "Campanha no ar" encerra a ficha e ela não dá mais
    // trabalho a ninguém.
    where: { status: { not: "CONCLUIDO" } },
    select: {
      id: true,
      companyName: true,
      createdAt: true,
      etapas: { orderBy: { concluidoEm: "desc" }, take: 1, select: { concluidoEm: true } },
      _count: { select: { etapas: true } },
    },
    take: 100,
  });

  return fichas.flatMap((f) => {
    // Sem etapa marcada, o relógio conta desde que a ficha chegou.
    const ultimoMovimento = f.etapas[0]?.concluidoEm ?? f.createdAt;
    const dias = diasEntre(ultimoMovimento, hoje0);
    if (dias < DIAS_PARADA) return [];

    const feitas = f._count.etapas;
    return [
      {
        chave: `implantacao-parada:${f.id}`,
        tipo: "implantacao-parada" as const,
        empresa: "AGENCIA" as const,
        titulo: f.companyName,
        detalhe:
          feitas === 0
            ? `Ficha chegou há ${dias} dias e nenhuma etapa foi marcada`
            : `${feitas} de ${TOTAL_DE_ETAPAS} etapas — parada há ${plural(dias, "dia", "dias")}`,
        nivel: nivelDoAtraso(dias),
        link: "/formularios",
        modulo: "formularios" as const,
        dias,
      },
    ];
  });
}

/**
 * Todos os alertas que o sistema tem hoje, de todas as empresas e sem dono
 * ainda. Quem recebe o quê é decidido depois, em destinatarios.ts — assim o
 * cálculo não precisa saber de gente, e a trava de quem pode ver fica num
 * lugar só.
 */
export async function calcularTodosOsAlertas(hoje: Date = new Date()): Promise<Alerta[]> {
  const listas = await Promise.all([
    lojasSemVender(hoje),
    gravacoesAtrasadas(hoje),
    mensalidadesVencidas(hoje),
    implantacoesParadas(hoje),
  ]);
  return listas.flat();
}
