import "server-only";

import { prisma } from "@/lib/prisma";

// A trilha do robô: uma linha por decisão.
//
// ── Por que isto precisou existir ────────────────────────────────────────
//
// Porque o robô ficou mudo no grupo de um cliente e não havia nada pra
// olhar. A mensagem chegava, a rota respondia "recebido" na hora, e o
// atendimento — que roda DEPOIS da resposta HTTP — decidia em silêncio.
//
// E não era só falta de registro: havia três `catch` vazios no caminho (a
// rota, o `responder()` e o aviso à equipe), e o `responder()` ainda jogava
// fora o retorno do envio. Como `enviarTexto` NÃO estoura quando a Z-API
// recusa — ela devolve `{ ok: false, erro }` —, a recusa era descartada sem
// nem virar exceção. O robô podia estar sendo proibido de falar no grupo e o
// sistema registrava sucesso.
//
// Cada hipótese virava um pedido de print pra quem estava do outro lado.
// Agora cada decisão deixa uma linha, e a próxima mensagem que chegar
// explica sozinha o que aconteceu com ela.
//
// ── Por que nunca estoura ────────────────────────────────────────────────
//
// Porque registro que derruba o que ele deveria estar registrando é pior que
// registro nenhum: o anúncio sairia do ar e a Z-API reenviaria a mensagem.
// Falhar em anotar é aceitável; falhar o atendimento por causa da anotação
// não é.

/**
 * Apaga o que tem cara de credencial.
 *
 * Erro de serviço às vezes devolve a URL que foi chamada, e na Z-API a URL
 * carrega a credencial no caminho. Sequências longas de letras-com-números
 * viram "•••" — id de grupo (só dígitos) e nome de anúncio passam intactos.
 */
export function semSegredo(texto: string): string {
  return texto
    .replace(/\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{20,}\b/gi, "•••")
    .slice(0, 400);
}

/** Anota um passo. Nunca estoura — ver acima. */
export async function anotar(
  messageId: string | null | undefined,
  de: string | null | undefined,
  passo: string,
  detalhe?: string | null,
): Promise<void> {
  try {
    await prisma.passoDoRobo.create({
      data: {
        messageId: messageId ?? null,
        de: de ?? null,
        passo: passo.slice(0, 60),
        detalhe: detalhe ? semSegredo(detalhe) : null,
      },
    });
  } catch {
    // Ver acima.
  }
}
