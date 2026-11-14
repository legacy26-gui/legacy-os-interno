"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import {
  conferirConexao,
  dadosDoAparelho,
  listarGrupos,
  enviarTexto,
  zapiConfigurado,
} from "@/lib/whatsapp/zapi";
import {
  VARIAVEIS_DA_ZAPI,
  type EstadoDaLigacao,
  type GrupoNaTela,
  type WhatsappState,
} from "@/lib/whatsapp/ligacao";

// As ações da tela de ligação com o WhatsApp.
//
// ── Por que uma tela só pra isto ──────────────────────────────────────────
//
// Porque a Z-API falha CALADA. O celular que hospeda a sessão desconecta, os
// envios passam a dar erro, e ninguém descobre até um cliente cobrar o
// relatório que o sistema jura ter mandado. Um lugar pra olhar e dizer "está
// de pé" é o que transforma uma falha silenciosa em uma falha visível.
//
// ── Por que ADMIN ────────────────────────────────────────────────────────
//
// Porque daqui se decide pra qual grupo vai o relatório de cada loja, e o
// pior erro possível deste sistema é o gasto e os leads da loja A caírem no
// grupo da loja B. É a mesma régua de definirGrupoDoWhatsapp, que continua
// sendo quem salva — esta tela só facilita a escolha.

function quaisFaltam(): string[] {
  return VARIAVEIS_DA_ZAPI.filter((v) => !process.env[v.nome]?.trim()).map(
    (v) => v.nome,
  );
}

/**
 * Em que pé está a ligação, agora.
 *
 * Não é cacheada de propósito: o valor desta informação é ser de AGORA. Uma
 * resposta de cinco minutos atrás dizendo "conectado" é pior que resposta
 * nenhuma, porque dá confiança sem base.
 */
export async function verEstadoDaLigacao(): Promise<EstadoDaLigacao> {
  await requireModuleAccess("configuracoes");

  const faltando = quaisFaltam();
  if (!zapiConfigurado()) {
    return {
      configurado: false,
      faltando,
      conectado: false,
      numero: null,
      nomeDoAparelho: null,
      erro: null,
    };
  }

  const status = await conferirConexao();
  // O aparelho só é perguntado se a conexão está de pé: com ela caída, a
  // resposta seria outro erro dizendo a mesma coisa.
  const aparelho = status.conectado ? await dadosDoAparelho() : null;

  return {
    configurado: true,
    faltando: [],
    conectado: status.conectado,
    numero: aparelho?.ok ? aparelho.aparelho.numero : null,
    nomeDoAparelho: aparelho?.ok ? aparelho.aparelho.nome : null,
    erro: status.erro,
  };
}

/**
 * Os grupos do número, já cruzados com as lojas que os usam.
 *
 * O cruzamento é aqui e não na tela porque é ele que responde a pergunta que
 * a pessoa tem na cabeça: "qual grupo ainda não está ligado em ninguém?".
 */
export async function buscarGruposDaZapi(): Promise<
  { ok: true; grupos: GrupoNaTela[] } | { ok: false; erro: string }
> {
  await requireModuleAccess("configuracoes");

  const r = await listarGrupos();
  if (!r.ok) return r;

  const lojas = await prisma.client.findMany({
    where: { whatsappGrupoId: { not: null } },
    select: { id: true, companyName: true, whatsappGrupoId: true },
  });
  const porGrupo = new Map(lojas.map((l) => [l.whatsappGrupoId!, l]));

  return {
    ok: true,
    grupos: r.grupos.map((g) => {
      const loja = porGrupo.get(g.id);
      return {
        ...g,
        lojaId: loja?.id ?? null,
        lojaNome: loja?.companyName ?? null,
      };
    }),
  };
}

/**
 * Manda uma mensagem de teste.
 *
 * Existe pra que o primeiro envio de verdade NÃO seja no grupo de um
 * cliente. Quem está ligando isso pela primeira vez quer ver uma mensagem
 * chegar antes de confiar o relatório da casa inteira ao robô — e o lugar
 * certo pra esse primeiro tiro é o próprio telefone de quem está testando.
 */
export async function mandarTesteNoWhatsapp(
  destino: string,
): Promise<WhatsappState> {
  const user = await requireModuleAccess("configuracoes");

  const r = await enviarTexto(
    destino,
    `Teste do Legacy OS — a ligação com o WhatsApp está funcionando. ` +
      `Mandado por ${user.name} em ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}.`,
  );

  if (!r.ok) return { erro: r.erro };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: "Mensagem mandada. Confira se chegou antes de confiar nela." };
}
