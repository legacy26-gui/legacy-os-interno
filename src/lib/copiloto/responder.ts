import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import type { QuemPergunta } from "@/lib/copiloto/consultas";
import { AiNaoConfigurado } from "@/lib/ai/config";
import { perguntar, type Turno, type Canal } from "@/lib/copiloto/cerebro";
import type { RespostaDoCopiloto } from "@/lib/copiloto/tipos";

// O Copiloto respondendo, sem saber quem perguntou DE ONDE.
//
// ── Por que isto foi separado da ação ────────────────────────────────────
//
// Porque agora existem duas portas: a tela, onde há sessão de navegador, e o
// WhatsApp privado, onde não há nenhuma — quem fala é um número, e o sistema
// descobre a pessoa por ele.
//
// A conferência de acesso ficou em quem CHAMA: a ação da tela faz
// `requireModuleAccess`, o atendimento do WhatsApp acha a pessoa pelo
// telefone e confere a mesma coisa. O que não pode acontecer é cada porta ter
// a sua própria versão do recorte de carteira — e é exatamente isso que esta
// função evita, sendo a única que monta a lista de lojas e resolve a ação
// proposta contra ela.
//
// É o mesmo arranjo de desenharRelatorioDaLoja: o robô da segunda não tem
// sessão, e a tentativa de fazê-lo passar pela rota logada fez TODA loja
// falhar calada. Separar auth de trabalho é o que conserta isso de vez.

/**
 * Responde uma pergunta com a carteira desta pessoa, e só com ela.
 *
 * ── O que esta camada garante ────────────────────────────────────────────
 *
 * 1. As lojas que o modelo pode citar são as da carteira de quem perguntou.
 *    Um gestor não descobre por aqui como vai a loja de outro.
 * 2. A ação proposta volta com o clientId RESOLVIDO aqui no servidor, contra
 *    a carteira. O que sai daqui não é o nome que o modelo escreveu: é uma
 *    loja que existe e é desta pessoa.
 * 3. Nada é executado. A proposta é proposta.
 */
export async function responderComoPessoa(
  user: QuemPergunta,
  pergunta: string,
  historico: Turno[],
  /** Muda só o JEITO de escrever, nunca o que é consultado. Ver cerebro.ts. */
  canal: Canal = "tela",
): Promise<RespostaDoCopiloto> {
  const texto = pergunta.trim();
  if (!texto) return { erro: "Escreva a pergunta." };
  if (texto.length > 2000) {
    return { erro: "Pergunta muito longa. Resuma em algumas linhas." };
  }

  // A mesma trava de lojasDoUsuario, e pelo mesmo motivo: esta lista é a
  // que o modelo enxerga como "as lojas existentes". Se ela trouxesse mais
  // que a loja do grupo, o modelo saberia o nome das outras — e saber o nome
  // já é vazar.
  const lojas = await prisma.client.findMany({
    where: {
      ...CARTEIRA,
      ...escopoDaCarteira(user),
      ...(user.soALoja ? { id: user.soALoja } : {}),
    },
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
      canal,
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
