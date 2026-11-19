"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
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

/**
 * Liga ou desliga o robô numa loja.
 *
 * ── Por que é por loja, e por que nasce desligado ────────────────────────
 *
 * Porque a confiança nisto se constrói olhando. O robô acerta a frase comum
 * ("vendeu o Compass, pode tirar") e pergunta quando tem dúvida, mas a loja
 * que escreve "saiu o da prata" todo dia vai ser uma sucessão de perguntas
 * — e a que tem dois carros do mesmo modelo nunca vai ter certeza.
 *
 * Ligar tudo no primeiro dia seria confiar antes de conferir. Ligar uma,
 * ver funcionar por uma semana e ligar as outras é o caminho que permite
 * voltar atrás sem ter estragado nada.
 */
export async function definirDesligaAuto(
  clientId: string,
  ligado: boolean,
): Promise<WhatsappState> {
  await requireModuleAccess("configuracoes");

  const loja = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true, whatsappGrupoId: true },
  });
  if (!loja) return { erro: "Loja não encontrada." };

  // Sem grupo o robô não tem como ser acionado: a mensagem chega e o sistema
  // não sabe de qual loja é. Ligar aqui prometeria algo que não acontece.
  if (ligado && !loja.whatsappGrupoId) {
    return {
      erro: "Escolha o grupo desta loja primeiro — é por ele que o robô sabe de quem é a mensagem.",
    };
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { whatsappDesligaAuto: ligado },
  });
  revalidatePath("/configuracoes/whatsapp");
  return {
    ok: ligado
      ? `O robô passa a desligar anúncio da ${loja.companyName} quando pedirem no grupo.`
      : `O robô não mexe mais em nada da ${loja.companyName}.`,
  };
}

/**
 * O endereço que a Z-API tem que chamar quando chega mensagem.
 *
 * O segredo vai no CAMINHO porque a Z-API só deixa configurar uma URL — não
 * há cabeçalho nem assinatura. Então o endereço inteiro vale como senha, e
 * esta função só o devolve pra quem já é ADMIN desta tela.
 *
 * Sem segredo configurado devolve `null` e uma sugestão de valor, porque o
 * próximo passo de quem vê isso é inventar um — e inventar segredo à mão é
 * como nascem segredos de seis letras.
 */
export async function verEnderecoDoWebhook(): Promise<{
  url: string | null;
  sugestao: string | null;
}> {
  await requireModuleAccess("configuracoes");

  const segredo = process.env.ZAPI_WEBHOOK_SECRET?.trim();
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);

  if (!segredo || segredo.length < 16) {
    return { url: null, sugestao: randomBytes(24).toString("base64url") };
  }
  return {
    url: `${base ?? ""}/api/whatsapp/recebido/${segredo}`,
    sugestao: null,
  };
}

/**
 * O envio automático de segunda está destravado?
 *
 * ── Por que esta pergunta mora aqui ──────────────────────────────────────
 *
 * Porque a rota que manda os relatórios EXIGE CRON_SECRET, sem o modo
 * tolerante que a dos alertas tem — ela manda mensagem pra cliente, e
 * mensagem mandada não se desmanda. Sem o segredo ela responde 503 e o envio
 * automático simplesmente não acontece, em silêncio, até alguém reparar na
 * segunda que o cliente não recebeu.
 *
 * Silêncio é o pior jeito de uma coisa dessas falhar. Então a tela pergunta,
 * e quando falta, entrega um valor sorteado pronto pra colar — em vez de
 * mandar a pessoa inventar um segredo à mão, que é como nascem segredos de
 * seis letras.
 */
export async function verEnvioAutomatico(): Promise<{
  ligado: boolean;
  sugestao: string | null;
}> {
  await requireModuleAccess("configuracoes");
  const segredo = process.env.CRON_SECRET?.trim();
  if (segredo) return { ligado: true, sugestao: null };
  return { ligado: false, sugestao: randomBytes(24).toString("base64url") };
}

/**
 * Marca (ou desmarca) um grupo como interno da agência.
 *
 * ── O que isto liga, e por que é decisão de ADMIN ────────────────────────
 *
 * Num grupo interno a IA responde PERGUNTA da equipe — "quais lojas estão
 * sem verba?" — com a carteira de quem escreveu. Num grupo de cliente ela
 * nunca faz isso, e o motivo é direto: a resposta listaria as lojas dos
 * outros clientes dentro da conversa de um deles.
 *
 * Por isso a lista é explícita e nasce vazia. Um grupo novo não vira interno
 * por descuido; alguém tem que vir aqui e dizer que é.
 */
export async function definirGrupoInterno(
  grupoId: string,
  nome: string,
  interno: boolean,
): Promise<WhatsappState> {
  const user = await requireModuleAccess("configuracoes");
  if (user.role !== "ADMIN") {
    return { erro: "Só o administrador define grupo interno." };
  }

  if (!interno) {
    await prisma.grupoInterno.deleteMany({ where: { grupoId } });
    revalidatePath("/configuracoes/whatsapp");
    return { ok: "A IA não responde mais perguntas neste grupo." };
  }

  // Grupo que já é de uma loja não pode virar interno: seria exatamente o
  // vazamento que a lista existe pra impedir. A tela já esconde esses, e esta
  // conferência é a que vale — tela se contorna, servidor não.
  const deLoja = await prisma.client.findFirst({
    where: { whatsappGrupoId: grupoId },
    select: { companyName: true },
  });
  if (deLoja) {
    return {
      erro: `Este grupo é o da ${deLoja.companyName}. Grupo de cliente não pode ser interno — a IA listaria as lojas dos outros lá dentro.`,
    };
  }

  await prisma.grupoInterno.upsert({
    where: { grupoId },
    create: { grupoId, nome: nome.slice(0, 200) },
    update: { nome: nome.slice(0, 200) },
  });
  revalidatePath("/configuracoes/whatsapp");
  return {
    ok: "Pronto. A equipe já pode marcar a IA com @ neste grupo e perguntar.",
  };
}

/** Os grupos marcados como internos, pra tela saber quais estão ligados. */
export async function listarGruposInternos(): Promise<string[]> {
  await requireModuleAccess("configuracoes");
  const linhas = await prisma.grupoInterno.findMany({ select: { grupoId: true } });
  return linhas.map((l) => l.grupoId);
}

/** Os últimos recados que a Z-API mandou, pra diagnóstico. */
export async function verRecadosDaZapi() {
  const user = await requireModuleAccess("configuracoes");
  if (user.role !== "ADMIN") return [];
  return prisma.recadoDaZapi.findMany({
    orderBy: { recebidoEm: "desc" },
    take: 8,
  });
}
