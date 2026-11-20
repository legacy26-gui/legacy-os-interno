import "server-only";

import { prisma } from "@/lib/prisma";
import { achatar, type AnuncioConhecido } from "./entender-pedido";

// "Pausa o conjunto do Versa."
//
// O robô sempre tirou ANÚNCIO do ar. Pausar o CONJUNTO é uma ordem maior: para
// todos os anúncios que estão dentro dele, de uma vez. Por isso só acontece
// quando a pessoa escreve a palavra "conjunto" — sem ela, o pedido continua
// sendo o de sempre (o anúncio do carro), e ninguém derruba um conjunto inteiro
// sem ter pedido.
//
// A busca é pelo NOME do conjunto, com o mesmo leitor dos anúncios: o conjunto é
// tratado como um "anúncio" cujo nome é o dele. Assim vale tudo que já vale lá —
// erro de digitação vira pergunta, dois conjuntos parecidos viram "qual deles?",
// e nunca se pausa por aproximação.

/** A frase pede um CONJUNTO ("pausa o conjunto do versa")? */
export function pedeConjunto(texto: string): boolean {
  return /(^|\s)(conjunto|conjuntos)(\s|$)/.test(achatar(texto));
}

/** O texto sem a palavra "conjunto": ela não diz qual é, e só atrapalha a busca do nome. */
export function semPalavraConjunto(texto: string): string {
  return texto
    .replace(/\bconjuntos?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os conjuntos que estão no ar nas contas da loja, no formato do leitor de pedidos. */
export async function conjuntosNoAr(contas: string[]): Promise<AnuncioConhecido[]> {
  if (contas.length === 0) return [];
  const conjuntos = await prisma.metaAdset.findMany({
    where: { adAccountId: { in: contas }, effectiveStatus: "ACTIVE" },
    select: { adsetId: true, name: true },
  });
  return conjuntos.map((c) => ({ adId: c.adsetId, nome: c.name, textos: [] }));
}
