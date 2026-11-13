// "Já mandei o link do Pix pra essa loja."
//
// ── O problema que isto resolve ───────────────────────────────────────────
//
// A lista acende vermelho na loja sem saldo. Só que ela não sabia a diferença
// entre uma loja que ninguém ainda olhou e uma que o gestor já cobrou às oito
// da manhã. As duas gritavam igual — e vermelho que grita por coisa já
// resolvida é vermelho que, em duas semanas, ninguém olha mais.
//
// Marcar o link como enviado tira a loja da fila do dia. Ela não some nem
// muda de cor pra verde (a conta continua zerada, isso é fato, não alarme):
// vira azul, "já foi cobrada", e desce pra baixo de quem ninguém tratou.
//
// ── Por que não existe "marcar como pago" ─────────────────────────────────
//
// Porque quem sabe se a verba entrou é a Meta, não a memória de ninguém.
// Saldo de conta pré-paga só DESCE com gasto; se ele subiu entre o envio do
// link e agora, é porque entrou dinheiro. Então o pedido se fecha sozinho na
// próxima leitura de saldo, e o gestor não tem uma segunda tarefa pra
// esquecer de fazer.
//
// ── E se o Pix não vier ───────────────────────────────────────────────────
//
// Depois de 18 horas o pedido vence e a loja volta pra fila — na frente de
// todas as outras. Promessa não cumprida é mais urgente que alerta novo:
// ali não falta só dinheiro, falta uma cobrança que já foi feita e ignorada.

/**
 * Quanto tempo um link enviado segura o alerta.
 *
 * 18 horas e não "até meia-noite": link mandado às onze da noite seguraria
 * uma hora, o que não ajuda ninguém. Assim, mandado de manhã vence à noite, e
 * mandado à noite vence no meio da manhã seguinte — que é quando alguém vai
 * olhar a lista de novo de qualquer jeito.
 */
export const VALIDADE_DO_PEDIDO_MS = 18 * 60 * 60 * 1000;

/**
 * Subida de saldo que conta como "a verba entrou".
 *
 * Saldo só desce com gasto, então em tese qualquer subida já seria dinheiro
 * novo. A margem existe porque o saldo não é um número que a Meta entrega:
 * é um texto que o sistema lê (ver saldo.ts), e arredondamento no meio do
 * caminho pode dar alguns centavos de diferença. Dez reais é menos que
 * qualquer Pix de verba real e mais que qualquer ruído de leitura.
 */
export const SUBIDA_MINIMA_CENTS = 1_000;

export type EstadoDoPedido =
  /** Link enviado, verba ainda não entrou, dentro do prazo. */
  | "aguardando"
  /** Link enviado há mais de 18h e a verba não veio. Vira prioridade. */
  | "vencido";

export interface PedidoNaTela {
  enviadoEm: Date;
  entrouEm: Date | null;
}

/**
 * Em que pé está o último pedido da loja.
 *
 * `null` quando não há pedido aberto — ou nunca houve, ou a verba já entrou.
 * Pedido resolvido não mexe mais na cor: a loja volta a ser julgada só pelo
 * saldo, que é o que importa dali em diante.
 */
export function estadoDoPedido(
  pedido: PedidoNaTela | null | undefined,
  agora = new Date()
): EstadoDoPedido | null {
  if (!pedido) return null;
  if (pedido.entrouEm) return null;
  const idade = agora.getTime() - pedido.enviadoEm.getTime();
  return idade < VALIDADE_DO_PEDIDO_MS ? "aguardando" : "vencido";
}

/** O saldo subiu o bastante pra dizer que a verba chegou? */
export function verbaEntrou(saldoAgoraCents: number, saldoNoEnvioCents: number | null): boolean {
  if (saldoNoEnvioCents === null) return false;
  return saldoAgoraCents - saldoNoEnvioCents >= SUBIDA_MINIMA_CENTS;
}

/** "há 20 min", "há 3 h", "ontem" — do jeito que se fala de uma cobrança. */
export function desdeOEnvio(enviadoEm: Date, agora = new Date()): string {
  const minutos = Math.floor((agora.getTime() - enviadoEm.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}
