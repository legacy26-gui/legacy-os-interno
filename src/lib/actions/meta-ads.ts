"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira, escopoDaCarteira, CARTEIRA } from "@/lib/carteira";
import { contaValida } from "@/lib/meta/saldo";
import { TIPOS_DE_LEAD } from "@/lib/meta/insights";
import { prazoDe } from "@/lib/meta/sincronizar-insights";
import { varrerContas, varrerCliente } from "@/lib/meta/varredura";
import { VALIDADE_DO_PEDIDO_MS } from "@/lib/meta/pedido-de-verba";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import {
  acharObjetoDaLoja,
  mudarStatus,
  ROTULO_DO_NIVEL,
  type NivelDoObjeto,
} from "@/lib/meta/mudar-status";

// Vincular conta de anúncio da Meta e buscar o saldo.
//
// Só ADMIN e GERENTE. Vincular conta de anúncio errada não é erro de digitação
// que se acha depois: o saldo de outra loja aparece na ficha desta, e quem
// olhar vai decidir Pix em cima de número que não é dele. Gestor de tráfego vê
// o saldo (é ele que precisa) mas não escolhe qual conta é de qual loja.
//
// Nada aqui recebe nem devolve token: o token vive só em src/lib/meta/ e
// nunca sai de lá.

export type MetaAdsState = { erro?: string; ok?: string };

/**
 * Nenhuma ação daqui pode EXPLODIR.
 *
 * Server Action que lança erro derruba a tela inteira no "This page couldn't
 * load" — a pessoa perde a página, não sabe o que houve, e o motivo fica num
 * log que ninguém abre. Apertar um botão que deu errado tem que devolver uma
 * frase, não uma tela preta.
 *
 * O redirect e o notFound do Next TAMBÉM são lançados como erro — é assim que
 * eles funcionam. Esses precisam passar direto, senão o "não tem permissão"
 * viraria uma mensagem vermelha no lugar de mandar a pessoa pro dashboard.
 */
async function semQuebrar(
  fazer: () => Promise<MetaAdsState>,
): Promise<MetaAdsState> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;

    console.error("[meta-ads] a ação falhou", erro);
    const msg = erro instanceof Error ? erro.message : String(erro);
    return { erro: `Deu erro no servidor: ${msg.slice(0, 300)}` };
  }
}

/** Só a direção vincula conta. */
async function quemPodeVincular(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (user.role !== "ADMIN" && user.role !== "GERENTE") return null;
  // O id vem do navegador. Pra ADMIN/GERENTE isto confirma que a loja existe.
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

function revalidar(clientId: string) {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/meta-ads");
  revalidatePath(`/meta-ads/${clientId}`);
}

/**
 * Liga uma conta de anúncio da Meta a um cliente.
 *
 * `metaAccountId` tem que ser "act_" seguido só de números — é o formato da
 * Meta, e validar aqui evita que um texto colado torto (um link inteiro, um
 * nome de conta) vire uma chamada à Graph API com caminho estranho.
 *
 * `isPrepay` marca conta que é abastecida por Pix. Só pra ela faz sentido
 * guardar saldo: em conta no cartão o número que a Meta devolve é limite de
 * crédito, que é outra conversa.
 */
export async function vincularContaAnuncios(
  clientId: string,
  metaAccountId: string,
  isPrepay: boolean,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await quemPodeVincular(clientId);
    if (!user) return { erro: "Só a direção pode vincular conta de anúncio." };

    const id = metaAccountId.trim();
    if (!contaValida(id)) {
      return {
        erro: 'O ID da conta precisa ser "act_" seguido só de números — por exemplo act_1234567890.',
      };
    }

    // metaAccountId é único no banco: a mesma conta não pode estar em duas
    // lojas. A checagem aqui é pra devolver uma frase que explica, em vez de
    // deixar o erro do banco subir.
    const jaExiste = await prisma.metaAdAccount.findUnique({
      where: { metaAccountId: id },
      select: { client: { select: { id: true, companyName: true } } },
    });
    if (jaExiste) {
      return {
        erro:
          jaExiste.client.id === clientId
            ? "Esta conta já está vinculada a este cliente."
            : `Esta conta já está vinculada a ${jaExiste.client.companyName}.`,
      };
    }

    await prisma.metaAdAccount.create({
      data: { clientId, metaAccountId: id, isPrepay },
    });

    revalidar(clientId);
    return {
      ok: isPrepay
        ? "Conta vinculada. Aperte “Atualizar agora” pra buscar o saldo."
        : "Conta vinculada (sem saldo pré-pago a acompanhar).",
    };
  });
}


/**
 * Quantas contas uma varredura busca de uma vez.
 *
 * Teto porque cada conta custa DUAS chamadas de rede (saldo e números), em
 * sequência, e a função tem tempo limitado pra responder. Melhor atualizar 25
 * e dizer que faltaram do que estourar no meio e não atualizar nenhuma.
 */
const CONTAS_POR_VARREDURA = 25;

/**
 * Quanto tempo a varredura pode gastar antes de devolver o que conseguiu.
 *
 * A Vercel MATA a função quando o tempo dela acaba — sem erro, sem mensagem,
 * sem passar por try/catch nenhum. O que a pessoa vê é a tela preta do Next e
 * nada atualizado. Por isso o limite é controlado aqui dentro, abaixo do da
 * plataforma: a função termina sozinha, com resposta na mão, antes de alguém
 * desligar ela na tomada.
 *
 * 45 segundos cabe folgado no menor limite da Vercel (60s). Carteira grande
 * precisa de dois ou três apertos, e a tela diz isso — melhor que um aperto
 * que morre no meio e não grava nada.
 */
const ORCAMENTO_MS = 45_000;

/**
 * Atualiza saldo e números de todas as contas que a pessoa enxerga.
 *
 * O recorte é o mesmo do resto do sistema: gestor de tráfego varre a carteira
 * dele, direção varre a casa. Quem não vê a loja não dispara chamada em nome
 * dela.
 *
 * Saldo e números num botão só porque são a mesma pergunta na cabeça de quem
 * aperta: "como está essa loja hoje". Dois botões garantiriam que um dia
 * alguém aperta um e esquece o outro, e aí metade da tela fica velha sem
 * ninguém perceber.
 */
export async function atualizarCarteira(): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");

    const contas = await prisma.metaAdAccount.findMany({
      where: {
        active: true,
        client: { ...CARTEIRA, ...escopoDaCarteira(user) },
      },
      // Mais velha primeiro: numa carteira maior que o teto, a varredura seguinte
      // pega quem ficou pra trás em vez de buscar sempre as mesmas.
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      take: CONTAS_POR_VARREDURA,
      select: {
        id: true,
        metaAccountId: true,
        isPrepay: true,
        leadActionType: true,
        clientId: true,
      },
    });

    if (contas.length === 0) {
      return {
        erro: "Nenhuma conta de anúncio vinculada nas suas lojas ainda.",
      };
    }

    const r = await varrerContas(contas, prazoDe(ORCAMENTO_MS));
    revalidatePath("/meta-ads");

    const faltou =
      r.naoDeuTempo > 0 ? ` Faltaram ${r.naoDeuTempo} — aperte de novo pra continuar.` : "";

    if (r.ok === 0 && r.falhou === 0) {
      return { erro: "Não deu tempo de atualizar nenhuma conta. Aperte de novo." };
    }
    if (r.ok === 0) {
      return {
        erro: `Não deu pra atualizar nenhuma das ${r.falhou} contas. O motivo está na linha de cada uma.${faltou}`,
      };
    }
    return {
      ok:
        (r.falhou === 0
          ? `${r.ok} ${r.ok === 1 ? "conta atualizada" : "contas atualizadas"}.`
          : `${r.ok} atualizada(s), ${r.falhou} com problema — o motivo está na linha de cada uma.`) +
        faltou,
    };
  });
}

/**
 * Atualiza UMA loja: saldo e números, de uma vez.
 *
 * É o botão da linha da lista e o da ficha. Existe porque a pergunta mais
 * comum não é "como está a casa", é "como está ESSA loja" — normalmente com
 * alguém no telefone do outro lado. Uma loja são duas chamadas: responde em
 * segundos, sem prazo apertado e sem risco de morrer no meio.
 *
 * Saldo e números juntos de propósito. Separados, um dia alguém aperta um e
 * esquece o outro, e metade da tela fica velha sem ninguém perceber.
 */
export async function atualizarLojaAgora(clientId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Esta loja não está na sua lista." };
    }

    const r = await varrerCliente(clientId);
    revalidar(clientId);

    if (r.total === 0) {
      return { erro: "Nenhuma conta de anúncio vinculada a esta loja." };
    }
    if (r.ok === 0) {
      return { erro: "Não deu pra atualizar. O motivo está na linha da conta." };
    }
    return {
      ok:
        r.falhou === 0
          ? "Atualizado."
          : `Atualizado, menos de ${r.falhou} conta(s) — o motivo está na linha de cada uma.`,
    };
  });
}


/**
 * Troca o que conta como "lead" numa conta.
 *
 * É configuração da conta, não do sistema: uma loja roda campanha de WhatsApp,
 * outra de formulário. Somar as duas como se fossem a mesma coisa daria um
 * custo por lead que não quer dizer nada.
 *
 * Mexer aqui NÃO reescreve o histórico sozinho — os dias já gravados ficam
 * com a contagem antiga até a próxima busca. A tela avisa disso.
 */
export async function definirTipoDeLead(
  clientId: string,
  contaId: string,
  tipo: string,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await quemPodeVincular(clientId);
    if (!user) {
      return { erro: "Só a direção muda o que conta como lead." };
    }

    if (!TIPOS_DE_LEAD.some((t) => t.valor === tipo)) {
      return { erro: "Tipo de lead desconhecido." };
    }

    // updateMany com o clientId junto: o id da conta vem do navegador, e assim
    // não dá pra mexer na conta de outra loja mandando outro id.
    const { count } = await prisma.metaAdAccount.updateMany({
      where: { id: contaId, clientId },
      data: { leadActionType: tipo },
    });
    if (count === 0) return { erro: "Conta não encontrada nesta loja." };

    revalidar(clientId);
    return {
      ok: "Tipo de lead trocado. Aperte “Atualizar agora” pra recontar os últimos 30 dias.",
    };
  });
}

/**
 * Troca a forma de pagamento de uma conta já vinculada.
 *
 * Isto existe porque errar na hora de vincular é fácil e o estrago é grande:
 * conta de Pix marcada como cartão desaparece de toda a vigilância de saldo —
 * a tela mostra "cartão", nenhum aviso de saldo acabando sai, e um dia a
 * campanha simplesmente para. Era obrigar a desvincular e vincular de novo,
 * perdendo o histórico, por causa de um clique.
 *
 * Marcar como cartão apaga os saldos guardados, de propósito. Em conta no
 * cartão o número que a Meta devolve é limite de crédito, não dinheiro
 * disponível, e deixar a leitura antiga na tabela faria a tela mostrar como
 * saldo um valor que não é saldo.
 */
export async function definirFormaDePagamento(
  clientId: string,
  contaId: string,
  prePago: boolean,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await quemPodeVincular(clientId);
    if (!user) {
      return { erro: "Só a direção muda a forma de pagamento da conta." };
    }

    // O clientId entra no where: o id da conta vem do navegador, e assim não
    // dá pra mexer na conta de outra loja mandando outro id.
    const { count } = await prisma.metaAdAccount.updateMany({
      where: { id: contaId, clientId },
      data: {
        isPrepay: prePago,
        // A leitura velha não vale mais: ou ela é de outra natureza (virou
        // cartão), ou ainda não existe (virou Pix agora). Zerar o erro junto
        // porque "não consegui ler o saldo" de uma conta que era cartão não
        // diz nada sobre a conta de agora.
        lastSyncError: null,
      },
    });
    if (count === 0) return { erro: "Conta não encontrada nesta loja." };

    if (!prePago) {
      await prisma.balanceSnapshot.deleteMany({ where: { adAccountId: contaId } });
    }

    revalidar(clientId);
    return {
      ok: prePago
        ? "Marcada como pré-paga (Pix). Aperte “Atualizar agora” pra buscar o saldo."
        : "Marcada como cartão. O saldo deixa de ser acompanhado.",
    };
  });
}

/**
 * Guarda quanto a loja combinou de investir por mês.
 *
 * É a régua do "o saldo está acabando?" quando ainda não há gasto de verdade
 * pra olhar. R$ 100 é uma semana pra quem gasta R$ 300 no mês e é meio dia pra
 * quem gasta R$ 6.000 — sem referência, nenhum aviso de saldo faz sentido.
 *
 * Aceita vazio pra limpar: loja que não tem combinado volta a não ter, em vez
 * de ficar com um número errado que ninguém lembra de onde veio.
 */
export async function definirGastoMensal(
  clientId: string,
  reais: string,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await quemPodeVincular(clientId);
    if (!user) {
      return { erro: "Só a direção define o investimento mensal da loja." };
    }

    const texto = reais.trim();
    let centavos: number | null = null;

    if (texto !== "") {
      // Aceita "3000", "3.000", "3000,50" e "R$ 3.000,00" — é o que sai de um
      // teclado de celular e de um copiar-e-colar da proposta. O ponto é
      // milhar e a vírgula é decimal, como se escreve aqui.
      const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".");
      const valor = Number(limpo);
      if (!Number.isFinite(valor) || valor < 0) {
        return { erro: "Valor inválido. Escreva só o número, por exemplo 3000." };
      }
      // Um teto que não atrapalha ninguém e barra o dedo escorregado: dez
      // milhões de reais por mês em anúncio não é loja de carro, é erro.
      if (valor > 10_000_000) {
        return { erro: "Valor alto demais — confira se não sobrou um zero." };
      }
      centavos = Math.round(valor * 100);
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { gastoMensalPrevistoCents: centavos },
    });

    revalidar(clientId);
    return {
      ok:
        centavos === null
          ? "Investimento mensal apagado. O aviso de saldo volta a usar só o gasto real."
          : "Investimento mensal guardado.",
    };
  });
}

/**
 * Liga ou desliga uma campanha, conjunto ou anúncio — de verdade, na Meta.
 *
 * ── Quem pode ────────────────────────────────────────────────────────────
 *
 * O gestor de tráfego PODE, nas lojas dele. É o trabalho dele: campanha que
 * está queimando verba sem resultado tem que parar na hora em que se percebe,
 * não no dia seguinte quando a direção abrir o sistema. Exigir ADMIN aqui
 * garantiria só uma coisa — que todo mundo continuasse fazendo pelo
 * Gerenciador, onde não fica registro nenhum.
 *
 * A trava que importa não é de cargo, é de CARTEIRA: cada um só mexe nas
 * lojas que são dele, e só em objeto que está no nosso cadastro daquela loja
 * (ver acharObjetoDaLoja). Id trocado no navegador não vira campanha de
 * outra pessoa pausada.
 *
 * ── O que fica registrado ────────────────────────────────────────────────
 *
 * Tudo, inclusive o que falhou. Pausar campanha é a primeira coisa que este
 * sistema faz que MUDA a realidade da loja em vez de só mostrá-la; quando uma
 * loja ficar um dia sem entregar, a pergunta vai ser "quem desligou?".
 */
export async function mudarStatusDoAnuncio(
  clientId: string,
  nivel: NivelDoObjeto,
  objetoId: string,
  ligar: boolean,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Essa loja não está na sua lista." };
    }

    if (!escritaLiberada()) {
      return {
        erro:
          "Ligar e desligar pela tela ainda não está liberado — falta o acesso de escrita na Meta.",
      };
    }

    const objeto = await acharObjetoDaLoja(clientId, nivel, objetoId);
    if (!objeto) {
      // Mensagem honesta: ou o id não é desta loja, ou o cadastro está velho.
      // Os dois casos se resolvem do mesmo jeito, e nenhum deles deve mandar
      // nada pra Meta.
      return {
        erro: `Não achei ${ROTULO_DO_NIVEL[nivel]} com esse id nas contas desta loja. Aperte “Atualizar agora” e tente de novo.`,
      };
    }

    const r = await mudarStatus({ clientId, quemId: user.id, nivel, objeto, ligar });
    if (!r.ok) return { erro: r.erro };

    revalidar(clientId);
    return {
      ok: r.ligado
        ? `${r.nome} ligado.`
        : objeto.levaJunto > 0
          ? `${r.nome} pausado — e com ${objeto.levaJunto} ${objeto.levaJunto === 1 ? "item" : "itens"} dentro que param junto.`
          : `${r.nome} pausado.`,
    };
  });
}

/**
 * "Mandei o link do Pix pra essa loja."
 *
 * Tira a loja da fila do dia por 18 horas: ela vira azul e desce pra baixo de
 * quem ninguém tratou ainda. O vermelho volta a significar "ninguém mexeu
 * nisso", que é a única coisa que faz vermelho servir pra alguma coisa.
 *
 * Guarda o saldo do momento do envio porque é ele que fecha o pedido depois,
 * sozinho: saldo de conta pré-paga só desce com gasto, então qualquer subida
 * daí em diante é dinheiro que chegou. Não existe "marcar como pago" — quem
 * sabe disso é a Meta, não a memória de ninguém.
 *
 * Gestor de tráfego PODE marcar, diferente de vincular conta. É ele quem
 * manda o link; exigir a direção pra registrar o que ele mesmo fez só
 * garantiria que ninguém registra.
 */
export async function marcarVerbaEnviada(clientId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Essa loja não está na sua lista." };
    }

    // Já existe pedido aberto? Marcar duas vezes não é erro de ninguém — é
    // dedo escorregado ou duas pessoas na mesma loja — e criar um segundo
    // pedido só reiniciaria o relógio das 18 horas, escondendo por mais tempo
    // uma loja que não recebeu nada.
    const aberto = await prisma.pedidoDeVerba.findFirst({
      where: { clientId, entrouEm: null },
      orderBy: { enviadoEm: "desc" },
      select: { id: true, enviadoEm: true },
    });
    if (aberto && Date.now() - aberto.enviadoEm.getTime() < VALIDADE_DO_PEDIDO_MS) {
      return { ok: "Essa loja já estava marcada como cobrada." };
    }

    // O saldo de agora, somado das pré-pagas. Só conta leitura que existe:
    // sem saldo lido não há marca d'água, e aí só o tempo resolve o pedido.
    const contas = await prisma.metaAdAccount.findMany({
      where: { clientId, active: true, isPrepay: true },
      select: {
        balanceSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { availableCents: true },
        },
      },
    });
    const lidas = contas.filter((c) => c.balanceSnapshots[0]);
    const saldo =
      contas.length > 0 && lidas.length === contas.length
        ? lidas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
        : null;

    await prisma.pedidoDeVerba.create({
      data: { clientId, enviadoPorId: user.id, saldoNoEnvioCents: saldo },
    });

    revalidar(clientId);
    return {
      ok:
        saldo === null
          ? "Marcado. Como o saldo não foi lido, este aviso volta em 18 horas."
          : "Marcado. O aviso volta se a verba não entrar em 18 horas.",
    };
  });
}

/** Desfaz a marcação — pra quando se clica na loja errada. */
export async function desmarcarVerbaEnviada(clientId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Essa loja não está na sua lista." };
    }

    // Só apaga pedido ABERTO: pedido com verba já confirmada é histórico, e
    // histórico não se apaga por clique.
    const { count } = await prisma.pedidoDeVerba.deleteMany({
      where: { clientId, entrouEm: null },
    });
    if (count === 0) return { erro: "Não havia marcação aberta nesta loja." };

    revalidar(clientId);
    return { ok: "Marcação desfeita. A loja volta pra fila." };
  });
}

/**
 * Vincula várias contas de uma vez, a partir da tela de descoberta.
 *
 * Cada par vem conferido por gente na tela — a sugestão por nome é palpite, e
 * conta vinculada à loja errada manda o gasto de uma pra ficha de outra sem
 * ninguém desconfiar.
 *
 * Nada de transação única: uma conta já usada por outra loja não pode
 * derrubar as outras trinta que estavam certas. Cada uma por si, e no fim a
 * tela diz quantas entraram e o que travou.
 */
export async function vincularVarias(
  pares: { clientId: string; metaAccountId: string; isPrepay: boolean }[]
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (user.role !== "ADMIN" && user.role !== "GERENTE") {
      return { erro: "Só a direção vincula conta de anúncio." };
    }
    if (pares.length === 0) return { erro: "Nenhuma conta marcada." };

    // As lojas da carteira, de uma vez: confere todos os clientId sem uma
    // consulta por par.
    const lojas = new Set(
      (
        await prisma.client.findMany({
          where: { ...CARTEIRA, ...escopoDaCarteira(user) },
          select: { id: true },
        })
      ).map((c) => c.id)
    );

    let entraram = 0;
    const problemas: string[] = [];

    for (const par of pares) {
      if (!lojas.has(par.clientId)) {
        problemas.push("uma loja fora da sua lista");
        continue;
      }
      if (!contaValida(par.metaAccountId)) {
        problemas.push(`${par.metaAccountId} não tem o formato act_<números>`);
        continue;
      }
      const jaExiste = await prisma.metaAdAccount.findUnique({
        where: { metaAccountId: par.metaAccountId },
        select: { client: { select: { companyName: true } } },
      });
      if (jaExiste) {
        problemas.push(`${par.metaAccountId} já é de ${jaExiste.client.companyName}`);
        continue;
      }
      await prisma.metaAdAccount.create({
        data: {
          clientId: par.clientId,
          metaAccountId: par.metaAccountId,
          isPrepay: par.isPrepay,
        },
      });
      entraram++;
    }

    revalidatePath("/meta-ads");
    revalidatePath("/meta-ads/vincular");

    if (entraram === 0) {
      return { erro: `Nenhuma vinculada. ${problemas.join("; ")}.` };
    }
    return {
      ok:
        problemas.length === 0
          ? `${entraram} ${entraram === 1 ? "conta vinculada" : "contas vinculadas"}. Aperte “Atualizar tudo” pra buscar os números.`
          : `${entraram} vinculada(s). Ficaram de fora: ${problemas.join("; ")}.`,
    };
  });
}

/** Desfaz um vínculo — e leva junto o que foi buscado por causa dele. */
export async function desvincularConta(contaId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (user.role !== "ADMIN" && user.role !== "GERENTE") {
      return { erro: "Só a direção desvincula conta de anúncio." };
    }

    const conta = await prisma.metaAdAccount.findUnique({
      where: { id: contaId },
      select: { clientId: true, metaAccountId: true },
    });
    if (!conta) return { erro: "Conta não encontrada." };
    if (!(await clienteEDaCarteira(user, conta.clientId))) {
      return { erro: "Essa loja não está na sua lista." };
    }

    // Os números vão junto: são cópia do que está na Meta, e ficar com o
    // gasto de uma conta que não é mais desta loja seria pior que perder.
    await prisma.$transaction(
      async (tx) => {
        await tx.metaInsightDaily.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaLifetime.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaAdCreative.deleteMany({ where: { adAccountId: contaId } });
        await tx.balanceSnapshot.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaAdAccount.delete({ where: { id: contaId } });
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    revalidar(conta.clientId);
    revalidatePath("/meta-ads/vincular");
    return { ok: `${conta.metaAccountId} desvinculada.` };
  });
}
