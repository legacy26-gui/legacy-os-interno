import "server-only";

import { prisma } from "@/lib/prisma";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";
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

/**
 * Depois de tirar anúncios do ar: o conjunto onde eles estavam ficou vazio?
 *
 * Regra do Guilherme: "se o conjunto não tiver mais nenhum anúncio ativo, desativa; se
 * tiver algum outro carro ainda, mantém". Conjunto sem anúncio ativo não entrega nada,
 * mas fica ligado no Gerenciador atrapalhando a leitura — e é o próximo anúncio que
 * alguém subir ali que volta a gastar sem ninguém ter decidido.
 *
 * "Ainda tem anúncio" é qualquer um que a PESSOA deixou ligado: status diferente de
 * pausado, arquivado ou excluído. Não olha o `effectiveStatus`, porque ele também vira
 * "pausado" quando falta saldo — e conjunto de loja sem verba não é conjunto vazio.
 *
 * Só mexe em conjunto que está no ar, e só nos conjuntos dos anúncios que ACABARAM de
 * sair. Anúncio sem conjunto no cadastro (ainda não sincronizado) não conta: sem saber
 * o que há no conjunto, o robô não o pausa.
 */
export async function pausarConjuntosVazios(a: {
  clientId: string;
  /** Os anúncios que acabaram de ser pausados com sucesso. */
  adIds: string[];
  quemId: string | null;
  pedidoPor: string | null;
  pedidoTexto: string | null;
}): Promise<{ pausados: string[]; falhas: string[] }> {
  const pausados: string[] = [];
  const falhas: string[] = [];
  if (a.adIds.length === 0) return { pausados, falhas };

  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId: a.clientId, active: true },
    select: { id: true },
  });
  const ids = contas.map((c) => c.id);
  if (ids.length === 0) return { pausados, falhas };

  const dos = await prisma.metaAdCreative.findMany({
    where: { adId: { in: a.adIds }, adAccountId: { in: ids }, adsetId: { not: null } },
    select: { adsetId: true },
  });
  const conjuntos = [...new Set(dos.map((x) => x.adsetId).filter((x): x is string => !!x))];

  for (const adsetId of conjuntos) {
    const noAr = await prisma.metaAdset.findFirst({
      where: { adsetId, adAccountId: { in: ids }, effectiveStatus: "ACTIVE" },
      select: { adsetId: true },
    });
    if (!noAr) continue;

    const sobraram = await prisma.metaAdCreative.count({
      where: {
        adsetId,
        adAccountId: { in: ids },
        OR: [{ status: null }, { status: { notIn: ["PAUSED", "ARCHIVED", "DELETED"] } }],
      },
    });
    if (sobraram > 0) continue;

    const objeto = await acharObjetoDaLoja(a.clientId, "conjunto", adsetId);
    if (!objeto) continue;
    const r = await mudarStatus({
      clientId: a.clientId,
      quemId: a.quemId,
      nivel: "conjunto",
      objeto,
      ligar: false,
      origem: "whatsapp",
      pedidoPor: a.pedidoPor,
      pedidoTexto: a.pedidoTexto,
    });
    if (r.ok) pausados.push(objeto.nome);
    else falhas.push(`${objeto.nome} (${r.erro})`);
  }
  return { pausados, falhas };
}

/** A frase que o robô acrescenta quando também pausou conjuntos vazios. */
export function textoDosConjuntosVazios(nomes: string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) {
    return `Como não sobrou nenhum anúncio ativo nele, pausei também o conjunto *${nomes[0]}*.`;
  }
  return (
    "Como não sobrou anúncio ativo nesses conjuntos, pausei também:\n" +
    nomes.map((n) => `• *${n}*`).join("\n")
  );
}
