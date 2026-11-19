// "Falaram comigo?"
//
// ── A regra, e por que ela existe ────────────────────────────────────────
//
// O robô só mexe em anúncio quando é MARCADO com @ na mensagem. Foi decisão
// do Guilherme, e é a trava mais importante que ele tem.
//
// Sem isso, o robô lia toda conversa do grupo procurando pedido. Num grupo de
// loja se fala de carro o dia inteiro — "vendeu o Compass ontem", "o Onix tá
// parado, hein" — e cada uma dessas frases era uma chance de ele desligar um
// anúncio que ninguém mandou desligar. O entendimento era bom, mas "bom" num
// grupo que recebe cem mensagens por dia ainda erra toda semana.
//
// Com o @, quem decide que é um pedido é a pessoa, não o robô. Ele deixa de
// adivinhar intenção e passa a obedecer ordem.
//
// ── Como o WhatsApp manda uma menção ─────────────────────────────────────
//
// O que aparece na tela é "@Aquila IA", mas o que viaja no texto da mensagem
// é "@554288126561" — o número, sem o +. É por isso que a procura aqui é por
// dígitos e não por nome: nome a pessoa troca, número não.
//
// A Z-API também manda, em alguns formatos, uma lista de mencionados. Quando
// vem, ela é usada; quando não vem, o texto resolve. Os dois caminhos juntos
// porque formato de webhook muda sem avisar, e a regra não pode depender de
// um campo que pode sumir numa atualização deles.
//
// Arquivo puro de propósito: sem rede e sem banco, dá pra testar a regra com
// os textos de verdade que chegam do grupo.

/** Só os dígitos. "+55 (42) 8812-6561" → "554288126561". */
function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Dois números são o mesmo?
 *
 * Comparação por sufixo, e não exata, porque o mesmo telefone brasileiro
 * circula escrito de várias formas: com e sem o 55, com e sem o nono dígito.
 * "554288126561" e "4288126561" são a mesma pessoa, e um robô que não
 * entendesse isso simplesmente nunca responderia.
 *
 * O piso de 8 dígitos é o que impede o sufixo de virar um casamento largo
 * demais — sem ele, "61" bateria com meio grupo.
 */
const MINIMO_DE_DIGITOS = 8;

export function mesmoNumero(a: string, b: string): boolean {
  const x = soDigitos(a);
  const y = soDigitos(b);
  if (x.length < MINIMO_DE_DIGITOS || y.length < MINIMO_DE_DIGITOS) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/**
 * O robô foi marcado nesta mensagem?
 *
 * `numeroDoRobo` vem do próprio recado da Z-API (`connectedPhone`): é o número
 * que está conectado na instância. Vir de lá e não de uma variável de
 * ambiente evita uma quinta variável pra configurar — e evita o pior caso,
 * que é a variável ficar com o número velho depois de uma troca de chip e o
 * robô parar de responder sem ninguém entender por quê.
 *
 * Sem saber o próprio número, devolve `false`: não dá pra provar que fomos
 * chamados, e na dúvida o robô NÃO age. É o lado seguro de errar — o preço
 * é uma mensagem ignorada, não um anúncio desligado por engano.
 */
export function foiMencionado(
  texto: string,
  numeroDoRobo: string | null | undefined,
  mencionados: string[] = [],
): boolean {
  if (!numeroDoRobo) return false;
  const meu = soDigitos(numeroDoRobo);
  if (meu.length < MINIMO_DE_DIGITOS) return false;

  // 1. A lista que a Z-API manda, quando manda.
  if (mencionados.some((m) => mesmoNumero(m, meu))) return true;

  // 2. O texto. Pega "@554288126561" e também "@55 42 8812-6561", que aparece
  //    quando o número não está salvo na agenda de quem escreveu.
  for (const achado of texto.matchAll(/@([\d\s().-]{8,25})/g)) {
    if (mesmoNumero(achado[1], meu)) return true;
  }
  return false;
}

/**
 * Tira a marcação do texto, pro entendimento do pedido não tropeçar nela.
 *
 * "@554288126561 vendeu o Compass" vira "vendeu o Compass". Sem isto, o
 * número entraria na conta de raridade de palavras de entender-pedido.ts e
 * poderia, sozinho, empurrar a escolha pro anúncio errado.
 */
export function semAMarcacao(texto: string): string {
  return texto.replace(/@[\d\s().-]{8,25}/g, " ").replace(/\s+/g, " ").trim();
}
