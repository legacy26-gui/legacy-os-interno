import "server-only";
import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";
import { ORCAMENTO_MINIMO_CENTS } from "./campanha-do-zero";

// Ajustar uma campanha DEPOIS de criada (pedido do Guilherme: "errei algo, carros no conjunto errado — poder fazer essas
// alterações pelo sistema").
//
// O que dá pra fazer: mover o anúncio pra outro conjunto, renomear anúncio e conjunto, mudar o orçamento do conjunto, criar
// um conjunto novo (copiando o público e a configuração de um que já existe) e excluir anúncio.
//
// ── Travas ──────────────────────────────────────────────────────────────
// • Só campanha de conta da loja (conferido pelo cadastro), e só conjunto/anúncio DESSA campanha (conferido na Meta).
// • Só mexe em anúncio e conjunto PAUSADO: o que está rodando é do Gerenciador — mover ou excluir anúncio no ar zera o
//   aprendizado e pode cortar venda. Nada é ligado: tudo que nasce aqui nasce pausado.
// • Cada ajuste fica no histórico (MetaAcao, tipo "ajuste").
//
// ── Mover de conjunto ───────────────────────────────────────────────────
// A Meta não deixa trocar o conjunto de um anúncio. "Mover" = criar o anúncio de novo no conjunto certo com o MESMO criativo
// (mesmas fotos, legenda e mensagem pronta) e excluir o do conjunto errado. O carro do estoque passa a apontar pro novo.

export interface ConjuntoDaCampanha {
  id: string;
  nome: string;
  status: string;
  orcamentoCents: number | null;
}
export interface AnuncioDaCampanha {
  id: string;
  nome: string;
  status: string;
  conjuntoId: string;
  criativoId: string | null;
  miniatura: string | null;
}
export type CampanhaParaAjustar =
  | { ok: true; id: string; nome: string; status: string; contaMeta: string; conjuntos: ConjuntoDaCampanha[]; anuncios: AnuncioDaCampanha[] }
  | { ok: false; erro: string };

type Status = { status?: string; effective_status?: string };
const pausado = (o: Status) => (o.status ?? o.effective_status ?? "") !== "ACTIVE";

async function contaDaLoja(clientId: string, contaMeta: string) {
  return prisma.metaAdAccount.findFirst({ where: { clientId, metaAccountId: contaMeta, active: true }, select: { id: true, metaAccountId: true } });
}

/** As campanhas recentes da conta (pra escolher qual ajustar). */
export async function campanhasDaConta(clientId: string, contaMeta: string): Promise<{ ok: true; campanhas: { id: string; nome: string; status: string; criadaEm: string | null }[] } | { ok: false; erro: string }> {
  const conta = await contaDaLoja(clientId, contaMeta);
  if (!conta) return { ok: false, erro: "Essa conta não é desta loja." };
  const r = await buscarNaGraph<{ data?: { id: string; name?: string; status?: string; created_time?: string }[] }>(`${conta.metaAccountId}/campaigns`, {
    fields: "id,name,status,created_time",
    limit: "30",
  });
  if (!r.ok) return { ok: false, erro: `A Meta não listou as campanhas: ${r.erro}` };
  const campanhas = (r.dados.data ?? [])
    .map((c) => ({ id: c.id, nome: c.name ?? c.id, status: c.status ?? "", criadaEm: c.created_time ?? null }))
    .sort((a, b) => (b.criadaEm ?? "").localeCompare(a.criadaEm ?? ""));
  return { ok: true, campanhas };
}

/** A campanha com os conjuntos e anúncios, lida da Meta (o que vale é o que está lá agora). */
export async function lerCampanhaParaAjustar(clientId: string, contaMeta: string, campanhaId: string): Promise<CampanhaParaAjustar> {
  const conta = await contaDaLoja(clientId, contaMeta);
  if (!conta) return { ok: false, erro: "Essa conta não é desta loja." };
  if (!/^\d{5,25}$/.test(campanhaId)) return { ok: false, erro: "Campanha inválida." };
  const camp = await buscarNaGraph<{ id: string; name?: string; status?: string; account_id?: string }>(campanhaId, { fields: "id,name,status,account_id" });
  if (!camp.ok) return { ok: false, erro: `A Meta não abriu a campanha: ${camp.erro}` };
  if (camp.dados.account_id && `act_${camp.dados.account_id}` !== conta.metaAccountId) return { ok: false, erro: "Essa campanha não é desta conta." };
  const [cs, as] = await Promise.all([
    buscarNaGraph<{ data?: { id: string; name?: string; status?: string; daily_budget?: string }[] }>(`${campanhaId}/adsets`, { fields: "id,name,status,daily_budget", limit: "200" }),
    buscarNaGraph<{ data?: { id: string; name?: string; status?: string; adset_id?: string; creative?: { id?: string; thumbnail_url?: string } }[] }>(`${campanhaId}/ads`, {
      fields: "id,name,status,adset_id,creative{id,thumbnail_url}",
      limit: "500",
    }),
  ]);
  if (!cs.ok) return { ok: false, erro: `A Meta não listou os conjuntos: ${cs.erro}` };
  if (!as.ok) return { ok: false, erro: `A Meta não listou os anúncios: ${as.erro}` };
  return {
    ok: true,
    id: camp.dados.id,
    nome: camp.dados.name ?? campanhaId,
    status: camp.dados.status ?? "",
    contaMeta: conta.metaAccountId,
    conjuntos: (cs.dados.data ?? [])
      .filter((c) => c.status !== "DELETED" && c.status !== "ARCHIVED")
      .map((c) => ({ id: c.id, nome: c.name ?? c.id, status: c.status ?? "", orcamentoCents: c.daily_budget ? Number(c.daily_budget) : null })),
    anuncios: (as.dados.data ?? [])
      .filter((a) => a.status !== "DELETED" && a.status !== "ARCHIVED")
      .map((a) => ({ id: a.id, nome: a.name ?? a.id, status: a.status ?? "", conjuntoId: a.adset_id ?? "", criativoId: a.creative?.id ?? null, miniatura: a.creative?.thumbnail_url ?? null })),
  };
}

async function registrar(p: { clientId: string; quemId: string | null; nivel: string; objetoId: string; nome: string; oque: string; ok: boolean; erro?: string | null; antes?: string | null; depois?: string | null }) {
  await prisma.metaAcao
    .create({
      data: {
        clientId: p.clientId,
        quemId: p.quemId,
        nivel: p.nivel,
        objetoId: p.objetoId,
        nome: p.nome.slice(0, 300),
        tipo: "ajuste",
        statusPedido: p.oque,
        statusAntes: p.antes?.slice(0, 300) ?? null,
        textoDepois: p.depois ?? null,
        ok: p.ok,
        erro: p.erro ?? null,
        origem: "sistema",
      },
    })
    .catch(() => {});
}

type Resultado = { ok: true; msg: string } | { ok: false; erro: string };

/** Confere que o objeto é da campanha (pela Meta, agora) e devolve a campanha lida. */
async function daCampanha(clientId: string, contaMeta: string, campanhaId: string) {
  if (!escritaLiberada()) return { ok: false as const, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  return lerCampanhaParaAjustar(clientId, contaMeta, campanhaId);
}

export async function moverAnuncio(p: { clientId: string; quemId: string | null; contaMeta: string; campanhaId: string; anuncioId: string; paraConjuntoId: string }): Promise<Resultado> {
  const c = await daCampanha(p.clientId, p.contaMeta, p.campanhaId);
  if (!c.ok) return c;
  const ad = c.anuncios.find((a) => a.id === p.anuncioId);
  const destino = c.conjuntos.find((x) => x.id === p.paraConjuntoId);
  if (!ad) return { ok: false, erro: "Esse anúncio não é desta campanha." };
  if (!destino) return { ok: false, erro: "Esse conjunto não é desta campanha." };
  if (ad.conjuntoId === destino.id) return { ok: true, msg: "Já está nesse conjunto." };
  if (!pausado(ad)) return { ok: false, erro: "Esse anúncio está rodando: pause antes de mover (o sistema só mexe em anúncio pausado)." };
  if (!ad.criativoId) return { ok: false, erro: "Não achei o criativo desse anúncio na Meta." };

  const novo = await escreverNaGraph<{ id?: string }>(`${c.contaMeta}/ads`, {
    name: ad.nome,
    adset_id: destino.id,
    creative: JSON.stringify({ creative_id: ad.criativoId }),
    status: "PAUSED",
  });
  if (!novo.ok || !novo.dados.id) {
    const erro = novo.ok ? "a Meta não devolveu o id" : novo.erro;
    await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: "anuncio", objetoId: ad.id, nome: ad.nome, oque: "mover", ok: false, erro });
    return { ok: false, erro: `A Meta não criou o anúncio no conjunto novo: ${erro}` };
  }
  const apagou = await escreverNaGraph(ad.id, { status: "DELETED" });
  await prisma.estoqueCarro.updateMany({ where: { rascunhoAdId: ad.id }, data: { rascunhoAdId: novo.dados.id } });
  const origem = c.conjuntos.find((x) => x.id === ad.conjuntoId)?.nome ?? ad.conjuntoId;
  await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: "anuncio", objetoId: novo.dados.id, nome: ad.nome, oque: "mover", ok: true, antes: origem, depois: destino.nome });
  return apagou.ok
    ? { ok: true, msg: `Movi *${ad.nome}* pro conjunto ${destino.nome}.` }
    : { ok: true, msg: `Criei *${ad.nome}* no conjunto ${destino.nome}, mas a Meta não excluiu o do conjunto antigo (${apagou.erro}): exclua lá.` };
}

export async function renomear(p: { clientId: string; quemId: string | null; contaMeta: string; campanhaId: string; nivel: "anuncio" | "conjunto"; id: string; nome: string }): Promise<Resultado> {
  const nome = p.nome.trim().slice(0, 200);
  if (!nome) return { ok: false, erro: "O nome ficou vazio." };
  const c = await daCampanha(p.clientId, p.contaMeta, p.campanhaId);
  if (!c.ok) return c;
  const obj = p.nivel === "anuncio" ? c.anuncios.find((a) => a.id === p.id) : c.conjuntos.find((x) => x.id === p.id);
  if (!obj) return { ok: false, erro: "Isso não é desta campanha." };
  const r = await escreverNaGraph(obj.id, { name: nome });
  await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: p.nivel, objetoId: obj.id, nome, oque: "nome", ok: r.ok, erro: r.ok ? null : r.erro, antes: obj.nome, depois: nome });
  return r.ok ? { ok: true, msg: "Nome trocado." } : { ok: false, erro: `A Meta não trocou o nome: ${r.erro}` };
}

export async function mudarOrcamentoDoConjunto(p: { clientId: string; quemId: string | null; contaMeta: string; campanhaId: string; conjuntoId: string; centavosPorDia: number }): Promise<Resultado> {
  if (!Number.isInteger(p.centavosPorDia) || p.centavosPorDia < ORCAMENTO_MINIMO_CENTS) return { ok: false, erro: "O orçamento mínimo é R$ 6 por dia." };
  if (p.centavosPorDia > 500_000) return { ok: false, erro: "Acima de R$ 5.000 por dia: confere o valor." };
  const c = await daCampanha(p.clientId, p.contaMeta, p.campanhaId);
  if (!c.ok) return c;
  const conj = c.conjuntos.find((x) => x.id === p.conjuntoId);
  if (!conj) return { ok: false, erro: "Esse conjunto não é desta campanha." };
  if (!pausado(conj)) return { ok: false, erro: "Esse conjunto está rodando: mude o orçamento pela tela de Meta Ads (ela registra a verba)." };
  if (conj.orcamentoCents === null) return { ok: false, erro: "Esse conjunto não tem orçamento próprio (o orçamento está na campanha)." };
  const r = await escreverNaGraph(conj.id, { daily_budget: String(p.centavosPorDia) });
  await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: "conjunto", objetoId: conj.id, nome: conj.nome, oque: "verba", ok: r.ok, erro: r.ok ? null : r.erro, antes: String(conj.orcamentoCents), depois: String(p.centavosPorDia) });
  return r.ok ? { ok: true, msg: "Orçamento trocado." } : { ok: false, erro: `A Meta não trocou o orçamento: ${r.erro}` };
}

/** Conjunto novo na campanha, copiando o público e a configuração de um que já existe (nasce pausado). */
export async function criarConjuntoCopiando(p: { clientId: string; quemId: string | null; contaMeta: string; campanhaId: string; modeloId: string; nome: string; centavosPorDia: number | null }): Promise<Resultado & { id?: string }> {
  const nome = p.nome.trim().slice(0, 200);
  if (!nome) return { ok: false, erro: "Dê um nome pro conjunto." };
  const c = await daCampanha(p.clientId, p.contaMeta, p.campanhaId);
  if (!c.ok) return c;
  if (!c.conjuntos.some((x) => x.id === p.modeloId)) return { ok: false, erro: "O conjunto modelo não é desta campanha." };
  const m = await buscarNaGraph<Record<string, unknown>>(p.modeloId, {
    fields: "targeting,optimization_goal,billing_event,destination_type,promoted_object,daily_budget,bid_strategy",
  });
  if (!m.ok) return { ok: false, erro: `A Meta não abriu o conjunto modelo: ${m.erro}` };
  const campos: Record<string, string> = { name: nome, campaign_id: c.id, status: "PAUSED" };
  for (const k of ["optimization_goal", "billing_event", "destination_type", "bid_strategy"]) if (typeof m.dados[k] === "string") campos[k] = m.dados[k] as string;
  for (const k of ["targeting", "promoted_object"]) if (m.dados[k] && typeof m.dados[k] === "object") campos[k] = JSON.stringify(m.dados[k]);
  if (m.dados.daily_budget) {
    const valor = p.centavosPorDia ?? Number(m.dados.daily_budget);
    if (valor < ORCAMENTO_MINIMO_CENTS) return { ok: false, erro: "O orçamento mínimo é R$ 6 por dia." };
    campos.daily_budget = String(valor);
  }
  const r = await escreverNaGraph<{ id?: string }>(`${c.contaMeta}/adsets`, campos);
  const id = r.ok ? r.dados.id : undefined;
  await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: "conjunto", objetoId: id ?? p.modeloId, nome, oque: "conjunto-novo", ok: !!id, erro: r.ok ? null : r.erro });
  return id ? { ok: true, msg: `Conjunto ${nome} criado (pausado).`, id } : { ok: false, erro: `A Meta não criou o conjunto: ${r.ok ? "não devolveu o id" : r.erro}` };
}

export async function excluirAnuncio(p: { clientId: string; quemId: string | null; contaMeta: string; campanhaId: string; anuncioId: string }): Promise<Resultado> {
  const c = await daCampanha(p.clientId, p.contaMeta, p.campanhaId);
  if (!c.ok) return c;
  const ad = c.anuncios.find((a) => a.id === p.anuncioId);
  if (!ad) return { ok: false, erro: "Esse anúncio não é desta campanha." };
  if (!pausado(ad)) return { ok: false, erro: "Esse anúncio está rodando: o sistema só exclui anúncio pausado." };
  const r = await escreverNaGraph(ad.id, { status: "DELETED" });
  if (r.ok) await prisma.estoqueCarro.updateMany({ where: { rascunhoAdId: ad.id }, data: { rascunhoAdId: null } });
  await registrar({ clientId: p.clientId, quemId: p.quemId, nivel: "anuncio", objetoId: ad.id, nome: ad.nome, oque: "excluir", ok: r.ok, erro: r.ok ? null : r.erro });
  return r.ok ? { ok: true, msg: `Excluí *${ad.nome}*.` } : { ok: false, erro: `A Meta não excluiu: ${r.erro}` };
}
