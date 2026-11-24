import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { listaDosAnunciosAtivos, pedeListaDeAnuncios } from "./anuncios-ativos";
import { acharLojaNoTexto, descartarPendente } from "./pausar-no-privado";

// "Quais anúncios ativos?" no PRIVADO do robô: a mesma lista do grupo ("Carros patrocinados." + os carros numerados), só dos que
// estão no ar, sem gasto. Só LEITURA, e só quando a pessoa pede.
//
// A loja vem, nesta ordem: do que a frase cita ("carros ativos da Lourenço"); do que a conversa recente já citava; da única loja que
// a pessoa tem. Sem nenhuma das três, o robô pergunta de qual loja — nunca chuta. A carteira vale como sempre: a gestora só
// enxerga as lojas dela.

type Pessoa = PessoaDaCasa & { name: string };

export async function tratarListaNoPrivado(
  pessoa: Pessoa,
  texto: string,
  conversaRecente: string[],
): Promise<{ mensagens: string[]; clientId: string | null } | null> {
  if (!pedeListaDeAnuncios(texto)) return null;

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa), metaAdAccounts: { some: { active: true } } },
    select: { id: true, companyName: true, metaAdAccounts: { where: { active: true }, select: { id: true } } },
    orderBy: { companyName: "asc" },
  });
  if (lojas.length === 0) return { mensagens: ["Não achei lojas com anúncios na sua carteira."], clientId: null };

  const nomes = lojas.map((l) => ({ id: l.id, nome: l.companyName }));
  const naFrase = acharLojaNoTexto(texto, nomes);
  if (naFrase.ambiguas.length > 0) {
    return { mensagens: [`Você citou mais de uma loja (${naFrase.ambiguas.map((l) => `*${l.nome}*`).join(", ")}). Me diz de qual quer a lista, uma por vez.`], clientId: null };
  }

  let escolhida = naFrase.loja;
  // A conversa de agora há pouco, do mais novo pro mais velho: "da LOURENÇO" dito antes ainda vale.
  if (!escolhida) {
    for (const falado of [...conversaRecente].reverse()) {
      const c = acharLojaNoTexto(falado, nomes);
      if (c.loja && c.ambiguas.length === 0) {
        escolhida = c.loja;
        break;
      }
    }
  }
  if (!escolhida && lojas.length === 1) escolhida = nomes[0];

  if (!escolhida) {
    const algumas = nomes.slice(0, 12).map((l) => l.nome).join(", ");
    return { mensagens: [`De qual loja você quer a lista? Escreve, por exemplo, "carros ativos da ${nomes[0].nome}".\n\nSuas lojas: ${algumas}${nomes.length > 12 ? "…" : "."}`], clientId: null };
  }

  const loja = lojas.find((l) => l.id === escolhida!.id)!;
  // Pedir a lista é outro assunto: uma pausa que estivesse esperando um "sim" não pode sobreviver a isto.
  await descartarPendente(pessoa.id);
  const lista = await listaDosAnunciosAtivos({ nome: loja.companyName, contas: loja.metaAdAccounts.map((c) => c.id) });
  // Com o nome da loja só quando a pessoa tem mais de uma: no grupo a loja é óbvia, aqui não.
  const mensagens = lojas.length > 1 && lista.carros > 0 ? lista.mensagens.map((m, i) => (i === 0 ? `*${loja.companyName}*\n${m}` : m)) : lista.mensagens;
  return { mensagens, clientId: loja.id };
}
