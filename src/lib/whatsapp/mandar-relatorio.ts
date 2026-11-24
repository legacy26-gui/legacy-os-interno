import "server-only";

import { prisma } from "@/lib/prisma";
import { desenharRelatorioDaLoja } from "@/app/api/meta-ads/relatorio/route";
import { lerIntervalo, PADRAO_DO_RELATORIO } from "@/lib/meta/insights";
import { enviarImagemAoGrupo, type ResultadoDoEnvio } from "./zapi";
import { comentarioDaSemana } from "@/lib/meta/comentario-do-relatorio";
import { legenda } from "./legenda-do-relatorio";

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
  //
  // Chama o DESENHO, não a rota. A rota confere quem está logado, e quem
  // chega aqui pelo robô da segunda de manhã não está logado em nada — era
  // isso que fazia toda loja falhar com "não consegui gerar a imagem". Quem
  // confere o acesso é quem chamou: o botão da tela passa pela rota, o robô
  // varre a carteira da casa pelo banco.
  const periodo = lerIntervalo({ periodo: "7" }, PADRAO_DO_RELATORIO);

  let resposta: Response;
  try {
    resposta = await desenharRelatorioDaLoja(clientId, periodo);
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

  // Duas linhas sobre a semana, escritas pela IA e CONFERIDAS em código contra os números. Reprovou ou a IA falhou: o
  // relatório sai como sempre, sem comentário (ele nunca atrasa nem impede o envio).
  const comentario = await comentarioDaSemana(clientId);

  const bytes = Buffer.from(await resposta.arrayBuffer());
  const dataUri = `data:image/png;base64,${bytes.toString("base64")}`;

  const r: ResultadoDoEnvio = await enviarImagemAoGrupo(
    loja.whatsappGrupoId,
    dataUri,
    legenda(loja.companyName, comentario)
  );
  return r;
}
