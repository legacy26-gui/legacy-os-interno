import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";
import { acharObjetoDaLoja } from "./mudar-status";
import {
  conferirEdicao,
  lerPublico,
  resumoTecnico,
  montarTargeting,
  resumoDoPublico,
  type EdicaoDoPublico,
  type LocalDoPublico,
  type PublicoDoConjunto,
} from "./publico-puro";

// Editar o PÚBLICO de um conjunto na Meta (idade, gênero e localização), do jeito do Gerenciador — com o "alcançar mais pessoas"
// (Advantage+ público) sempre desligado. As regras de ler/montar moram em publico-puro.ts.
//
// ── As travas ───────────────────────────────────────────────────────────
//   • O conjunto tem que ser de uma conta DESTA loja (o id vem do navegador): `acharObjetoDaLoja`, como o ligar/desligar e a verba.
//   • A escrita parte do `targeting` que a Meta acabou de devolver (não do nosso cadastro) e troca só idade, gênero, localização
//     e o Advantage+; interesses, públicos e exclusões seguem como estão.
//   • Depois de escrever, LÊ de novo e compara: o que a Meta não aplicou vira aviso, nunca "deu certo" no escuro.
//   • Todo pedido (e toda recusa) fica gravado em MetaAcao (tipo "publico"), com o targeting de antes e de depois.

export type LeituraDoPublico =
  | { ok: true; nome: string; noAr: boolean; status: string | null; publico: PublicoDoConjunto; tecnico: string }
  | { ok: false; erro: string };

export async function lerPublicoDoConjunto(clientId: string, adsetId: string): Promise<LeituraDoPublico> {
  const achado = await acharObjetoDaLoja(clientId, "conjunto", adsetId);
  if (!achado) return { ok: false, erro: "Esse conjunto não é de uma conta desta loja." };
  const r = await buscarNaGraph<{ name?: string; status?: string; effective_status?: string; targeting?: unknown }>(adsetId, { fields: "name,status,effective_status,targeting" });
  if (!r.ok) return { ok: false, erro: `A Meta não me deixou ler o público agora: ${r.erro}` };
  if (!r.dados.targeting) return { ok: false, erro: "A Meta não devolveu o público desse conjunto." };
  return {
    ok: true,
    nome: r.dados.name ?? achado.nome,
    status: r.dados.status ?? null,
    noAr: (r.dados.effective_status ?? r.dados.status) === "ACTIVE",
    publico: lerPublico(r.dados.targeting),
    tecnico: resumoTecnico(r.dados.targeting),
  };
}

/** Procura cidades e estados do Brasil pelo nome (a busca de localização da própria Meta). */
export async function buscarLocais(termo: string): Promise<{ ok: true; locais: LocalDoPublico[] } | { ok: false; erro: string }> {
  const q = termo.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, locais: [] };
  const r = await buscarNaGraph<{ data?: { key?: string; name?: string; type?: string; region?: string; country_name?: string }[] }>("search", {
    type: "adgeolocation",
    q,
    location_types: JSON.stringify(["city", "region"]),
    country_code: "BR",
    limit: "10",
  });
  if (!r.ok) return { ok: false, erro: `A busca da Meta falhou: ${r.erro}` };
  const locais: LocalDoPublico[] = [];
  for (const x of r.dados.data ?? []) {
    if (!x.key || !x.name) continue;
    if (x.type === "city") locais.push({ tipo: "cidade", chave: x.key, nome: x.name, detalhe: ["Cidade", x.region].filter(Boolean).join(" · "), raioKm: 17 });
    else if (x.type === "region") locais.push({ tipo: "regiao", chave: x.key, nome: x.name, detalhe: ["Estado", x.country_name].filter(Boolean).join(" · "), raioKm: null });
  }
  return { ok: true, locais };
}

export type ResultadoDoPublico = { ok: true; resumo: string; avisos: string[] } | { ok: false; erro: string };

export async function salvarPublicoDoConjunto(p: { clientId: string; quemId: string; adsetId: string; edicao: EdicaoDoPublico }): Promise<ResultadoDoPublico> {
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  const erro = conferirEdicao(p.edicao);
  if (erro) return { ok: false, erro };
  const achado = await acharObjetoDaLoja(p.clientId, "conjunto", p.adsetId);
  if (!achado) return { ok: false, erro: "Esse conjunto não é de uma conta desta loja." };

  // Sempre parte do que a Meta tem AGORA.
  const atual = await buscarNaGraph<{ targeting?: unknown }>(p.adsetId, { fields: "targeting" });
  if (!atual.ok || !atual.dados.targeting) return { ok: false, erro: `A Meta não me deixou ler o público antes de mudar: ${atual.ok ? "sem dados" : atual.erro}` };
  const antes = lerPublico(atual.dados.targeting);
  const novo = montarTargeting(atual.dados.targeting, p.edicao);

  const escrita = await escreverNaGraph(p.adsetId, { targeting: JSON.stringify(novo) });
  await prisma.metaAcao.create({
    data: {
      clientId: p.clientId,
      quemId: p.quemId,
      tipo: "publico",
      nivel: "conjunto",
      objetoId: p.adsetId,
      nome: achado.nome,
      statusPedido: "targeting",
      statusAntes: null,
      textoAntes: `${resumoDoPublico(antes)}\n${JSON.stringify(atual.dados.targeting)}`.slice(0, 60_000),
      textoDepois: `${resumoDoPublico(p.edicao)}\n${JSON.stringify(novo)}`.slice(0, 60_000),
      ok: escrita.ok,
      erro: escrita.ok ? null : escrita.erro,
    },
  });
  if (!escrita.ok) return { ok: false, erro: `A Meta não aceitou: ${escrita.erro}` };

  // Confere o que ficou: o que a Meta não aplicou vira aviso.
  const avisos: string[] = [];
  const depois = await buscarNaGraph<{ targeting?: unknown }>(p.adsetId, { fields: "targeting" });
  if (!depois.ok || !depois.dados.targeting) {
    avisos.push("Salvei, mas não consegui reler o conjunto pra conferir. Confere no Gerenciador.");
  } else {
    const lido = lerPublico(depois.dados.targeting);
    if (lido.idadeMin !== p.edicao.idadeMin || lido.idadeMax !== p.edicao.idadeMax) avisos.push(`A Meta ficou com a idade ${lido.idadeMin}–${lido.idadeMax}, não ${p.edicao.idadeMin}–${p.edicao.idadeMax}.`);
    if (lido.genero !== p.edicao.genero) avisos.push("A Meta não manteve o gênero pedido.");
    if (lido.locais.length !== p.edicao.locais.length) avisos.push(`A Meta ficou com ${lido.locais.length} localização(ões), e eu pedi ${p.edicao.locais.length}. Confere no Gerenciador.`);
    if (lido.expansaoLigada === true) avisos.push("O Advantage+ público continua LIGADO na Meta, e eu pedi pra desligar. Desliga no Gerenciador.");
  }
  return { ok: true, resumo: resumoDoPublico(p.edicao), avisos };
}
