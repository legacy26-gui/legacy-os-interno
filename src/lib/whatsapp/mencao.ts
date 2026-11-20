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
// O que aparece na tela é "@Aquila IA", mas o que viaja no texto é um número
// depois do @ — e AQUI MORA UMA ARMADILHA que custou dois dias.
//
// O WhatsApp está trocando o telefone por um identificador privado, o "@lid"
// (Linked ID), pra não expor o número de ninguém. A Z-API só repassa o que o
// aplicativo manda, e a troca é gradual e inconsistente: num grupo a marcação
// vem como "@554288126561" (o telefone, 12 dígitos), noutro vem como
// "@81896604192873" (o lid, 14 dígitos). O mesmo robô, o mesmo número, dois
// textos diferentes — e a doc da Z-API diz que NÃO existe conversão de lid
// pra telefone.
//
// Foi o que deixou o robô mudo no grupo da R2: a marcação chegava, tinha 14
// dígitos, e a comparação com os 12 do telefone nunca batia. O que denunciou
// foi o tamanho do texto: 38 caracteres = "@" + 14 dígitos + o resto.
//
// A saída é perguntar à Z-API qual é o lid do NOSSO número (ver
// identidade-do-robo.ts) e aceitar os dois. O lid chega aqui já pronto, pelo
// parâmetro `apelidos`, porque este arquivo é puro: sem rede, sem banco.
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

/** Uma marcação achada no texto: onde ela está e quais dígitos carrega. */
export interface Marcacao {
  inicio: number;
  fim: number;
  digitos: string;
}

/** Quantos dígitos já formam um identificador inteiro. Telefone tem 12 ou 13;
 *  lid tem 14 ou 15. Passou de 12, o grupo seguinte já é outra coisa. */
const DIGITOS_DE_UM_ID = 12;

/**
 * As marcações do texto: tudo que vem depois de um "@" e parece número.
 *
 * ── Por que não é só a regex ────────────────────────────────────────────
 *
 * Porque a regex antiga engolia o que viesse colado: em "@554288126561 2008
 * vendeu", o 2008 virava parte do número ("5542881265612008"), a comparação
 * falhava, e o robô ignorava um pedido legítimo. Pior: ao tirar a marcação
 * pra entender o pedido, o 2008 — que era o ano do carro — saía junto.
 *
 * O número "@55 42 8812-6561" aparece escrito com espaços quando não está na
 * agenda de quem escreveu, então não dá pra cortar no primeiro espaço. A
 * regra é: junta grupos separados por espaço até completar um identificador
 * inteiro (12 dígitos), e para ali.
 */
export function marcacoesDoTexto(texto: string): Marcacao[] {
  const achadas: Marcacao[] = [];
  for (const m of texto.matchAll(/@([\d\s().+-]{8,25})/g)) {
    const bruto = m[1];
    let digitos = "";
    let consumido = 0;
    for (const g of bruto.match(/\S+|\s+/g) ?? []) {
      if (digitos.length >= DIGITOS_DE_UM_ID) break;
      digitos += soDigitos(g);
      consumido += g.length;
    }
    if (digitos.length < MINIMO_DE_DIGITOS) continue;
    const inicio = m.index ?? 0;
    achadas.push({ inicio, fim: inicio + 1 + consumido, digitos });
  }
  return achadas;
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
  /**
   * Os outros identificadores do robô — o lid. Comparados por IGUALDADE
   * exata, e não por sufixo como o telefone: lid não tem DDI nem nono dígito
   * pra variar, e sufixo aqui só abriria margem pra casar com outra pessoa.
   */
  apelidos: string[] = [],
): boolean {
  if (!numeroDoRobo) return false;
  const meu = soDigitos(numeroDoRobo);
  if (meu.length < MINIMO_DE_DIGITOS) return false;

  const ids = apelidos.map(soDigitos).filter((a) => a.length >= MINIMO_DE_DIGITOS);
  const sou = (candidato: string) =>
    mesmoNumero(candidato, meu) || ids.includes(soDigitos(candidato));

  // 1. A lista que a Z-API manda, quando manda.
  if (mencionados.some(sou)) return true;

  // 2. O texto. Pega "@554288126561", "@55 42 8812-6561" e "@81896604192873".
  return marcacoesDoTexto(texto).some((x) => sou(x.digitos));
}

/**
 * Tira a marcação do texto, pro entendimento do pedido não tropeçar nela.
 *
 * "@554288126561 vendeu o Compass" vira "vendeu o Compass". Sem isto, o
 * número entraria na conta de raridade de palavras de entender-pedido.ts e
 * poderia, sozinho, empurrar a escolha pro anúncio errado.
 */
export function semAMarcacao(texto: string): string {
  // De trás pra frente, pra os índices das marcações anteriores não andarem.
  let saida = texto;
  for (const x of marcacoesDoTexto(texto).reverse()) {
    saida = saida.slice(0, x.inicio) + " " + saida.slice(x.fim);
  }
  return saida.replace(/\s+/g, " ").trim();
}
