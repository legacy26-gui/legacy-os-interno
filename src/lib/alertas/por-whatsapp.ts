import { diaDaCasaComoData } from "@/lib/dia-da-casa";
import {
  NIVEL_MINIMO_NO_WHATSAPP,
  ROTULO_DO_TIPO,
  piorPrimeiro,
  type Alerta,
  type TipoDeAlerta,
} from "./tipos";

// Os avisos do robô, escritos pra WhatsApp.
//
// Arquivo puro de propósito: sem banco e sem rede, pra dar pra testar o texto
// que chega no celular de verdade com os casos que importam.
//
// ── Um recado por pessoa, e não um por alerta ────────────────────────────
//
// A Z-API não é oficial. Ela conecta um número comum pelo mesmo caminho do
// WhatsApp Web, e rajada de mensagem desse número é o jeito mais rápido
// conhecido de ele ser bloqueado — e bloqueado, para o envio da casa inteira,
// inclusive os relatórios dos clientes.
//
// Um gestor com cinco lojas sem verba e duas sem relatório receberia sete
// mensagens. Aqui ele recebe UMA, com seções. Menos pra ele ler, e a conta
// do número do robô fica a de um colega mandando recado.
//
// ── Por que só de segunda a sexta ────────────────────────────────────────
//
// Decisão do Guilherme: fim de semana ninguém é incomodado. O que piorar no
// sábado e no domingo chega na segunda às 8h, com o estado de segunda — e como
// o robô só avisa o que PIOROU desde a última vez, nada se perde no caminho.

/**
 * Hoje é dia de mandar WhatsApp pra equipe?
 *
 * Em America/Sao_Paulo, não em UTC: às 22h de sexta em Caxias o UTC já virou
 * sábado, e o robô decidiria "fim de semana" três horas antes da hora.
 */
export function ehDiaUtilNaCasa(agora: Date = new Date()): boolean {
  const dia = diaDaCasaComoData(agora).getUTCDay();
  return dia >= 1 && dia <= 5;
}

/** Tira o que o WhatsApp não deve receber ainda — ver NIVEL_MINIMO_NO_WHATSAPP. */
export function alertasQueVaoPraWhatsapp(alertas: Alerta[]): Alerta[] {
  return alertas.filter((a) => a.nivel >= (NIVEL_MINIMO_NO_WHATSAPP[a.tipo] ?? 1));
}

/** Do mais urgente pro menos: dinheiro acabando vem antes de papelada. */
const ORDEM_DAS_SECOES: TipoDeAlerta[] = [
  "sem-verba",
  "relatorio-nao-enviado",
  "venda-parada",
  "mensalidade-vencida",
  "gravacao-atrasada",
  "implantacao-parada",
  "reuniao-marcada",
];

/** Quantas linhas cabem numa seção antes de virar "e mais N". */
const LINHAS_POR_SECAO = 6;

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * O texto do recado.
 *
 * Formato de WhatsApp: UM asterisco pra negrito (dois aparecem como
 * asteriscos mesmo), e nenhum "~" — ele é tachado quando abre e fecha, e um
 * "~" solto numa frase vira texto riscado sem aviso.
 *
 * Nome de loja entra no recado porque o recado é da PESSOA: o roteamento
 * (destinatarios.ts) já garantiu que só chegam aqui alertas da carteira dela.
 */
export function montarRecado(nome: string, alertas: Alerta[]): string {
  const porTipo = new Map<TipoDeAlerta, Alerta[]>();
  for (const a of alertas) {
    const lista = porTipo.get(a.tipo) ?? [];
    lista.push(a);
    porTipo.set(a.tipo, lista);
  }

  const secoes: string[] = [];
  for (const tipo of ORDEM_DAS_SECOES) {
    const lista = porTipo.get(tipo);
    if (!lista?.length) continue;
    lista.sort(piorPrimeiro);

    const linhas = lista
      .slice(0, LINHAS_POR_SECAO)
      .map((a) => `• *${a.titulo}*${a.detalhe ? ` — ${a.detalhe}` : ""}`);
    const sobram = lista.length - LINHAS_POR_SECAO;
    if (sobram > 0) linhas.push(`• …e mais ${sobram}`);

    secoes.push(`*${ROTULO_DO_TIPO[tipo]}*\n${linhas.join("\n")}`);
  }

  return [
    `Oi, ${primeiroNome(nome)}! Hoje precisa de atenção:`,
    ...secoes,
    "Resolve pelo Legacy OS. Se já tratou, é só ignorar: eu só volto a falar disso se piorar.",
  ].join("\n\n");
}
