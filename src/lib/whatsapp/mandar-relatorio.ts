import "server-only";

import { prisma } from "@/lib/prisma";
import { GET as desenharRelatorio } from "@/app/api/meta-ads/relatorio/route";
import { enviarImagemAoGrupo, type ResultadoDoEnvio } from "./zapi";

// Pegar o relatório da semana de uma loja e mandar no grupo dela.
//
// ── Por que isto CHAMA a rota do relatório em vez de desenhar de novo ─────
//
// Porque o desenho é um só, e tem que continuar sendo. Copiar o JSX pra cá
// criaria duas folhas que começam iguais e divergem no primeiro ajuste — o
// gestor confere uma na tela e o cliente recebe outra no WhatsApp.
//
// Chamar a rota tem uma segunda vantagem, e é a que pesa mais: as travas
// dela vêm junto. A rota confere o acesso ao módulo e confere se a loja é da
// carteira de quem pediu, nessa ordem, antes de tocar em qualquer número. Se
// o envio desenhasse por fora, essas duas conferências precisariam ser
// reescritas aqui — e a reescrita é onde a trava se perde.
//
// O endereço abaixo é interno: nada sai pela rede. O `new Request` só existe
// porque é assim que um handler recebe os parâmetros.

/**
 * O que vai escrito junto da imagem.
 *
 * Curto de propósito. A imagem já diz tudo: loja, período e os quatro
 * números. Legenda comprida no WhatsApp aparece cortada com um "ler mais", e
 * quem recebe lê a imagem antes do texto de qualquer jeito.
 */
function legenda(loja: string): string {
  return `Relatório da semana — ${loja}\n\nQualquer dúvida é só chamar por aqui. 🦅`;
}

export type EnvioDoRelatorio =
  | { ok: true; id: string | null }
  | { ok: false; erro: string };

/**
 * Gera o relatório dos últimos 7 dias e manda no grupo da loja.
 *
 * Não marca nada como enviado: quem marca é quem chamou. Assim esta função
 * serve tanto ao botão (uma loja, com resposta na tela) quanto ao robô (a
 * casa inteira, gravando o resultado de cada uma) sem que uma das duas
 * precise desfazer o que a outra fez.
 */
export async function mandarRelatorioNoGrupo(clientId: string): Promise<EnvioDoRelatorio> {
  const loja = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true, whatsappGrupoId: true },
  });
  if (!loja) return { ok: false, erro: "Loja não encontrada." };
  if (!loja.whatsappGrupoId) {
    return { ok: false, erro: "Esta loja ainda não tem grupo de WhatsApp cadastrado." };
  }

  // 7 dias: é o período do relatório semanal, e é o mesmo que o botão da
  // tela abre. Dois períodos diferentes pro mesmo relatório seria a mesma
  // divergência que o desenho duplicado causaria.
  const pedido = new Request(
    `http://interno/api/meta-ads/relatorio?loja=${encodeURIComponent(clientId)}&periodo=7d`
  );

  let resposta: Response;
  try {
    resposta = await desenharRelatorio(pedido);
  } catch {
    return { ok: false, erro: "Não consegui gerar a imagem do relatório." };
  }

  if (!resposta.ok) {
    // 409 é o caso real e tem recado próprio: a loja não teve leitura boa da
    // Meta, e mandar R$ 0,00 em tudo pro cliente seria pior que não mandar.
    if (resposta.status === 409) {
      return {
        ok: false,
        erro: "Esta loja ainda não teve uma leitura boa da Meta — o relatório sairia zerado.",
      };
    }
    return { ok: false, erro: `Não consegui gerar o relatório (${resposta.status}).` };
  }

  const bytes = Buffer.from(await resposta.arrayBuffer());
  const dataUri = `data:image/png;base64,${bytes.toString("base64")}`;

  const r: ResultadoDoEnvio = await enviarImagemAoGrupo(
    loja.whatsappGrupoId,
    dataUri,
    legenda(loja.companyName)
  );
  return r;
}
