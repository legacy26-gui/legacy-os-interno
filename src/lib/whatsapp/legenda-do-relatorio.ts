// O texto que vai escrito junto da imagem do relatório semanal. Arquivo puro (sem rede nem banco).

/**
 * O que vai escrito junto da imagem.
 *
 * Curto de propósito. A imagem já diz tudo: loja, período e os quatro
 * números. Legenda comprida no WhatsApp aparece cortada com um "ler mais", e
 * quem recebe lê a imagem antes do texto de qualquer jeito.
 */
export function legenda(loja: string, comentario: string | null = null): string {
  // O comentário (duas linhas, já conferidas contra os números — ver comentario-do-relatorio.ts) vem entre o título e o convite.
  return `Relatório da semana — ${loja}\n\n${comentario ? `${comentario}\n\n` : ""}Qualquer dúvida é só chamar por aqui. 🦅`;
}
