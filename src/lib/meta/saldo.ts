// Leitura do saldo pré-pago (Pix) da Meta.
//
// A Meta não entrega o saldo como número. Entrega como FRASE, pronta pra
// mostrar na tela dela, no idioma da conta:
//
//   "Saldo disponível (R$1.142,78 BRL)"
//
// Então o jeito de saber o saldo é ler a frase. Isso é feio e é frágil — se a
// Meta mudar o texto, para de funcionar — e é exatamente por isso que o
// parse mora num arquivo só dele, sem banco e sem rede: dá pra testar os
// casos reais sem subir nada.
//
// Este arquivo é puro de propósito (não é "server-only"): a regra é a mesma no
// servidor e em qualquer teste.

/**
 * Tira o saldo em CENTAVOS de um texto da Meta.
 *
 * Formato brasileiro: ponto separa milhar, vírgula separa centavos.
 *   "Saldo disponível (R$1.142,78 BRL)"  → 114278
 *   "Saldo disponível (R$0,00 BRL)"      → 0
 *
 * Devolve `null` quando não dá pra ter certeza — e aí a tela mostra
 * "indisponível". Isso é de propósito: saldo errado é pior que saldo
 * faltando. Quem olha um número na tela toma decisão em cima dele; quem vê
 * "indisponível" vai conferir no painel da Meta.
 *
 * Por isso exige a vírgula com dois dígitos. "R$1.142" sem centavos podia ser
 * mil cento e quarenta e dois reais ou um real e cento e quarenta e dois —
 * um erro de mil vezes. Melhor devolver null.
 *
 * Centavos e não reais porque dinheiro em decimal quebrado dá diferença de um
 * centavo na soma. O banco guarda Int, a conta é toda em Int, e a divisão por
 * 100 acontece só na hora de escrever na tela.
 */
export function parseSaldoEmCentavos(texto: string | null | undefined): number | null {
  if (!texto) return null;

  // Parte inteira: ou grupos de milhar separados por ponto (1.142, 12.345.678),
  // ou uma sequência de dígitos sem separador (1142). Depois, vírgula e
  // exatamente dois dígitos de centavos.
  const achado = texto.match(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/);
  if (!achado) return null;

  const reais = achado[1].replace(/\./g, "");
  const centavos = achado[2];

  // Number e não parseInt: "0012" é doze, não octal, nos dois — mas Number
  // falha alto se vier lixo, em vez de devolver meia leitura.
  const valor = Number(`${reais}${centavos}`);
  return Number.isSafeInteger(valor) ? valor : null;
}

/** Centavos → "R$ 1.142,78". */
export function saldoEmReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * "agora mesmo", "há 5 min", "há 3 h", "há 2 dias".
 *
 * Em cima de saldo isso não é enfeite: saldo é número que vence. R$ 40 lidos
 * há dez minutos é informação; R$ 40 lidos há três dias é chute.
 */
export function tempoDesde(quando: Date, agora = new Date()): string {
  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

// ───────────────────────── Quando o saldo preocupa ─────────────────────────
//
// Isto morava aqui como dois valores fixos — "abaixo de R$ 50 é crítico,
// abaixo de R$ 150 é baixo" — e eu tinha deixado escrito que era um palpite
// meu à espera da regra da casa. A regra chegou, e ela não é um valor: é
// QUANTOS DIAS o saldo ainda dura, porque uma loja gasta R$ 300 no mês e a
// outra gasta R$ 3.000, e R$ 100 é uma semana pra primeira e meio dia pra
// segunda.
//
// Está em src/lib/meta/estado-da-loja.ts, que é onde ela pode usar o gasto
// real da loja. Aqui ficou só a leitura do número.

/** Formato de ID de conta de anúncio da Meta: "act_" e só números depois. */
export const FORMATO_DA_CONTA = /^act_\d+$/;

export function contaValida(id: string): boolean {
  return FORMATO_DA_CONTA.test(id);
}
