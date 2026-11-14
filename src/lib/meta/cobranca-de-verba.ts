// A cobrança de verba, pronta pra mandar.
//
// ── O que isto NÃO é ──────────────────────────────────────────────────────
//
// Não é um gerador de Pix. Nesta agência o dinheiro vai do cliente direto
// pra Meta, e o Pix da Meta nasce dentro da tela de cobrança da conta dele,
// com a chave da Meta. Ninguém de fora emite aquele código — nem nós. Se o
// sistema gerasse um Pix aqui, seria um Pix pra Legacy, e o dinheiro cairia
// no lugar errado. Isso não é limitação técnica que dê pra contornar: é de
// quem é o dinheiro.
//
// ── O que sobra, e por que vale mais do que parece ────────────────────────
//
// O trabalho de cobrar não é gerar código. É descobrir quanto pedir. Hoje
// isso é feito de cabeça: o gestor olha o saldo, lembra mais ou menos quanto
// a loja gasta, chuta um número e manda. Chuta pra menos e cobra de novo em
// três dias; chuta pra mais e o cliente reclama.
//
// O sistema já sabe o ritmo real da loja — gasto dos últimos 14 dias dividido
// pelos dias que têm dado (ver estado-da-loja.ts). Então ele faz a conta:
// quanto falta pra aquela loja rodar os próximos sete dias. E escreve a
// mensagem inteira, com o número, o que ele compra em dias, e o caminho pra
// pagar.
//
// ── Por que o link vem acompanhado do caminho na mão ──────────────────────
//
// Porque o endereço da tela de cobrança da Meta não é documentado. Ele
// funciona, é o que o próprio Gerenciador usa, mas a Meta muda esses caminhos
// sem avisar ninguém. Um link morto na mão de um cliente é pior que link
// nenhum: ele clica, não abre, e desiste — e aí a verba não entra por causa
// de uma URL. Com o caminho escrito ao lado, o pior caso é ele navegar.

import { saldoEmReais } from "./saldo";

/**
 * Quantos dias a cobrança cobre, por padrão.
 *
 * Sete e não trinta porque é assim que estas lojas abastecem: por semana,
 * não por mês (a mesma razão que faz DIAS_ACABANDO ser 2 em estado-da-loja).
 * Pedir um mês de uma vez numa loja que põe por semana é pedir um "não".
 */
export const DIAS_DA_COBRANCA = 7;

/**
 * De quanto em quanto o valor sugerido sobe.
 *
 * Ninguém manda Pix de R$ 487,23. O número que sai da conta é exato demais
 * pra uma conversa de WhatsApp — e valor quebrado faz o cliente perguntar de
 * onde saiu, o que transforma uma cobrança de dez segundos numa explicação.
 *
 * Arredonda sempre PRA CIMA: pra baixo entrega menos dias do que a mensagem
 * prometeu, e aí o sistema teria mentido.
 */
export const DEGRAU_CENTS = 5_000;

/** Abaixo disso não vale a viagem de um Pix. */
export const MINIMO_CENTS = 5_000;

/**
 * Quanto pedir pra loja rodar `dias` dias.
 *
 * Desconta o que já tem em conta — cobrar o valor cheio de quem tem metade
 * do dinheiro lá dentro é pedir demais, e pedir demais é como se perde a
 * confiança no número.
 *
 * `null` quando não dá pra saber: sem ritmo não há conta, e inventar um
 * valor aqui seria pior que deixar a pessoa digitar o dela.
 */
export function quantoPedirCents(
  gastoDiarioCents: number | null,
  saldoCents: number | null,
  dias: number = DIAS_DA_COBRANCA
): number | null {
  if (!gastoDiarioCents || gastoDiarioCents <= 0) return null;
  if (dias <= 0) return null;

  const precisa = gastoDiarioCents * dias;
  const falta = precisa - (saldoCents ?? 0);
  if (falta <= 0) return null;

  const arredondado = Math.ceil(falta / DEGRAU_CENTS) * DEGRAU_CENTS;
  return Math.max(arredondado, MINIMO_CENTS);
}

/** Quantos dias um valor compra, no ritmo de hoje. */
export function diasQueCompra(
  valorCents: number,
  gastoDiarioCents: number | null,
  saldoCents: number | null
): number | null {
  if (!gastoDiarioCents || gastoDiarioCents <= 0) return null;
  return Math.floor((valorCents + (saldoCents ?? 0)) / gastoDiarioCents);
}

/**
 * O endereço da tela de cobrança daquela conta.
 *
 * O id vem como "act_123456" e a Meta quer só o número na query. Devolve
 * `null` pro que não tem essa cara, porque meio link é pior que link nenhum.
 *
 * NÃO é endereço documentado — ver o cabeçalho deste arquivo. Por isso quem
 * monta a mensagem sempre põe CAMINHO_MANUAL junto.
 */
export function linkDeCobranca(contaId: string | null | undefined): string | null {
  if (!contaId) return null;
  const casa = /^act_(\d+)$/.exec(contaId.trim());
  if (!casa) return null;
  return (
    "https://business.facebook.com/ads/manager/account_settings/account_billing/" +
    `?act=${casa[1]}&tab=account_billing_set`
  );
}

/** O caminho pra quem o link não abrir. */
export const CAMINHO_MANUAL =
  "Gerenciador de Anúncios → menu de três riscos → Cobranças → Adicionar dinheiro";

export interface DadosDaCobranca {
  /** O nome da loja, como o cliente a chama. */
  loja: string;
  /** Saldo somado das pré-pagas, ou null quando não foi lido. */
  saldoCents: number | null;
  /** Dias que o saldo ainda dura. */
  diasDeSaldo: number | null;
  /** Quanto está sendo pedido. */
  pedirCents: number;
  /** O que esse valor compra em dias, no ritmo de hoje. */
  diasQueCompra: number | null;
  /** Endereço da tela de cobrança, quando existe. */
  link: string | null;
}

/**
 * A mensagem, pronta pra colar no WhatsApp.
 *
 * Escrita como uma pessoa escreve, não como sistema: sem "prezado cliente",
 * sem "conforme solicitado". Quem recebe é dono de loja, e dono de loja lê
 * três linhas.
 *
 * A ordem é de propósito — primeiro o problema (está acabando), depois o
 * número, depois como pagar. Quem já sabe o que fazer para na segunda linha
 * e não precisa ler o resto.
 */
export function textoDaCobranca(d: DadosDaCobranca): string {
  const linhas: string[] = [];

  // Abertura: o estado da conta. Sem saldo lido, não finge saber.
  if (d.saldoCents === null) {
    linhas.push(`Oi! A conta de anúncios da ${d.loja} está precisando de verba.`);
  } else if (d.diasDeSaldo !== null && d.diasDeSaldo < 1) {
    linhas.push(
      `Oi! A conta de anúncios da ${d.loja} está com ${saldoEmReais(d.saldoCents)} — ` +
        `não dá nem pra fechar o dia de hoje.`
    );
  } else {
    const dias =
      d.diasDeSaldo === null
        ? ""
        : d.diasDeSaldo === 1
          ? ", o que dá mais 1 dia"
          : `, o que dá mais ${d.diasDeSaldo} dias`;
    linhas.push(
      `Oi! A conta de anúncios da ${d.loja} está com ${saldoEmReais(d.saldoCents)}${dias}.`
    );
  }

  // O número. É a linha que importa, então fica sozinha.
  //
  // Zero dia não vira "(dá mais 0 dias de anúncio)". Além de frase feia,
  // escondia um aviso: naquele valor a loja não fecha nem o dia seguinte, e
  // quem está cobrando precisa ler isso antes de mandar.
  const compra =
    d.diasQueCompra === null
      ? ""
      : d.diasQueCompra < 1
        ? " (ainda assim não fecha um dia inteiro)"
        : d.diasQueCompra === 1
          ? " (dá mais 1 dia de anúncio)"
          : ` (dá mais ${d.diasQueCompra} dias de anúncio)`;
  linhas.push(`Pra não parar, o ideal é adicionar ${saldoEmReais(d.pedirCents)}${compra}.`);

  // Como pagar. O Pix é lá dentro, na conta dele — o sistema não emite.
  if (d.link) {
    linhas.push(`Dá pra pagar por Pix na própria Meta, cai na hora:\n${d.link}`);
    linhas.push(`Se o link não abrir: ${CAMINHO_MANUAL}.`);
  } else {
    linhas.push(`É por Pix na própria Meta, cai na hora: ${CAMINHO_MANUAL}.`);
  }

  linhas.push("Assim que entrar, os anúncios voltam sozinhos. Qualquer coisa me chama!");

  return linhas.join("\n\n");
}
