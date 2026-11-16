"use server";

import { requireModuleAccess } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { AiNaoConfigurado } from "@/lib/ai/config";
import { perguntar, type Turno } from "@/lib/copiloto/cerebro";
import type { RespostaDoCopiloto } from "@/lib/copiloto/tipos";

// A porta do Copiloto.
//
// ── O que esta camada garante ────────────────────────────────────────────
//
// 1. Quem pergunta tem acesso ao módulo de clientes. Sem isso, não entra.
// 2. As lojas que o modelo pode citar são as da CARTEIRA de quem perguntou.
//    Um gestor não descobre por aqui como vai a loja de outro.
// 3. A ação proposta já volta com o clientId RESOLVIDO aqui no servidor,
//    contra a carteira. O que chega na tela não é o nome que o modelo
//    escreveu: é uma loja que existe e é de quem está perguntando.
// 4. Nada é executado. A proposta vira botão; o botão chama a mesma função
//    que a tela do Meta Ads já usa, com a confirmação que ela já exige.

export async function perguntarAoCopiloto(
  pergunta: string,
  historico: Turno[],
): Promise<RespostaDoCopiloto> {
  const user = await requireModuleAccess("clientes");

  const texto = pergunta.trim();
  if (!texto) return { erro: "Escreva a pergunta." };
  if (texto.length > 2000) {
    return { erro: "Pergunta muito longa. Resuma em algumas linhas." };
  }

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });

  if (lojas.length === 0) {
    return {
      resposta:
        "Não há nenhuma loja na sua carteira, então não tenho dado nenhum pra olhar.",
      acoes: [],
      fonte: null,
    };
  }

  try {
    const r = await perguntar(
      user,
      texto,
      // O histórico vem da tela e é dado de entrada como qualquer outro:
      // cortado no tamanho e na quantidade antes de virar prompt.
      (historico ?? []).slice(-12).map((t) => ({
        de: t.de === "gestor" ? ("gestor" as const) : ("copiloto" as const),
        texto: String(t.texto ?? "").slice(0, 4000),
      })),
      lojas.map((l) => l.companyName),
    );

    // Resolve o nome que o modelo escreveu contra a carteira de verdade.
    // Proposta sobre loja que não existe — ou que não é desta pessoa — é
    // descartada aqui e não chega a virar botão.
    const achatar = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    const acoes = r.acoes
      .map((a) => {
        const loja =
          lojas.find((l) => achatar(l.companyName) === achatar(a.loja)) ??
          lojas.find((l) => achatar(l.companyName).includes(achatar(a.loja)));
        if (!loja || !a.objetoId?.trim()) return null;
        return {
          tipo: a.tipo,
          clientId: loja.id,
          loja: loja.companyName,
          objetoId: a.objetoId.trim(),
          nome: a.nome,
          valorReais: a.valorReais,
          porQue: a.porQue,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .slice(0, 3);

    return { resposta: r.resposta, acoes, fonte: r.fonte };
  } catch (erro) {
    if (erro instanceof AiNaoConfigurado) {
      return {
        erro:
          "O Copiloto ainda não tem chave de IA configurada. " +
          "Ver Configurações → Copiloto pra saber qual variável falta.",
      };
    }
    // A mensagem do client.ts já vem em português e sem segredo dentro.
    return {
      erro:
        erro instanceof Error
          ? erro.message.slice(0, 300)
          : "Não consegui responder agora.",
    };
  }
}
