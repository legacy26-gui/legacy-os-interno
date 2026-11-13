// Que dia é hoje para a casa.
//
// Sem "server-only": a tela precisa saber se hoje é o dia da foto pra mostrar
// a câmera no lugar da caixinha, e o servidor precisa saber pra exigir. Se
// cada lado calculasse por conta, num domingo à noite um deles já estaria na
// segunda e o outro não.
//
// Tudo em America/Sao_Paulo, e não em UTC: às 22h de domingo em Caxias o UTC
// já virou segunda, e a equipe seria cobrada da foto um dia antes.

const FUSO = "America/Sao_Paulo";

/** O dia de hoje na casa, no formato aaaa-mm-dd. */
export function diaDaCasa(agora: Date = new Date()): string {
  // en-CA dá exatamente aaaa-mm-dd, que é o formato que o resto do sistema usa.
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/**
 * Segunda-feira é o dia da foto.
 *
 * A foto da campanha era cobrada todo dia. Virou uma por semana, na segunda:
 * cobrança diária de foto vira foto repetida só pra fechar o quadrado, e aí o
 * registro deixa de valer como prova de que alguém olhou de verdade.
 */
export function ehDiaDaFoto(agora: Date = new Date()): boolean {
  return agora.toLocaleDateString("en-US", { timeZone: FUSO, weekday: "short" }) === "Mon";
}

/** O dia da casa como Date de meia-noite UTC, pra guardar em coluna de data. */
export function diaDaCasaComoData(agora: Date = new Date()): Date {
  const [ano, mes, dia] = diaDaCasa(agora).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * A segunda-feira da semana de hoje, como Date de meia-noite UTC.
 *
 * É a chave do relatório semanal: "o relatório da semana de 10/11 já foi
 * mandado pra essa loja?". Usar a data de hoje não serviria — o gestor que
 * manda na terça marcaria um dia diferente do que mandou na segunda, e a
 * mesma semana contaria duas vezes.
 *
 * Segunda e não domingo porque é o começo da semana de trabalho daqui, e é
 * no dia da foto que os relatórios saem.
 */
export function segundaDaSemana(agora: Date = new Date()): Date {
  const hoje = diaDaCasaComoData(agora);
  // getUTCDay: 0 = domingo. Domingo tem que voltar seis dias, não um.
  const diaDaSemana = hoje.getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return new Date(hoje.getTime() - recuo * 24 * 60 * 60 * 1000);
}
