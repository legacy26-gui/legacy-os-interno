import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira } from "@/lib/carteira";
import { dobrar } from "@/lib/datas-da-conversa";
import { anunciarCarroDoEstoque, lojaPodeAnunciarAgora } from "@/lib/estoque/anunciar-agora";
import { acharLojaNoTexto, type AcaoDeAnuncioDoEstoque } from "./pausar-no-privado";

// "Anunciar o Compass da Vilela" no privado do robô: o carro do ESTOQUE vira rascunho PAUSADO na Meta (fotos do site, legenda
// da IA, o "mesmo de sempre" da loja). O robô mostra o que vai fazer e só faz depois do "sim". Nada vai ao ar.
//
// Quem pode: quem tem o carro na carteira (a gestora, só as lojas dela; gerência e dono, todas) — a mesma régua do resto.
// Só pega carro que está no site e ainda sem rascunho. Frase que não acha um carro assim volta null (segue pro Copiloto): o
// verbo "anunciar" aparece em muita conversa, e o robô só age quando tem certeza de qual carro é.

export interface PedidoMontado {
  resposta: string;
  pendente: AcaoDeAnuncioDoEstoque | null;
}

const PALAVRAS_SOLTAS = new Set(["o", "a", "os", "as", "da", "do", "de", "das", "dos", "na", "no", "agora", "um", "uma", "carro", "carros", "pra", "para", "la", "ai", "novo", "nova", "ele", "ela", "esse", "essa", "este", "esta", "veiculo"]);

/** A frase manda anunciar um carro do estoque? Devolve o resto da frase (o carro e a loja), ou null. Pura. */
export function pedeAnunciarDoEstoque(texto: string): string | null {
  if (/[?]/.test(texto)) return null;
  const t = dobrar(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const m = t.match(/^(?:anunciar|anuncia|anuncie)\s+(.+)$/);
  if (!m) return null;
  const resto = m[1].split(" ").filter((p) => !PALAVRAS_SOLTAS.has(p));
  return resto.length > 0 ? m[1] : null;
}

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export async function montarAnuncioDoEstoque(pessoa: { id: string; role: string }, texto: string): Promise<PedidoMontado | null> {
  const resto = pedeAnunciarDoEstoque(texto);
  if (!resto) return null;

  const carros = await prisma.estoqueCarro.findMany({
    where: { sumiuEm: null, rascunhoAdId: null, client: { ...CARTEIRA_NO_META, ...escopoDaCarteira({ id: pessoa.id, role: pessoa.role as "ADMIN" }) } },
    select: { id: true, titulo: true, anoModelo: true, precoCents: true, clientId: true, client: { select: { companyName: true } } },
    orderBy: { primeiraVezEm: "desc" },
    take: 600,
  });
  if (carros.length === 0) return null;

  // 1) a loja, se a frase cita (entre as lojas que têm carro assim).
  const lojas = [...new Map(carros.map((c) => [c.clientId, { id: c.clientId, nome: c.client.companyName }])).values()];
  const citada = acharLojaNoTexto(resto, lojas);
  if (citada.ambiguas.length > 0) return { resposta: `Você citou mais de uma loja (${citada.ambiguas.map((l) => `*${l.nome}*`).join(", ")}). Anuncio um carro de uma loja por vez.`, pendente: null };
  const daLoja = citada.loja ? carros.filter((c) => c.clientId === citada.loja!.id) : carros;

  // 2) o carro: todas as palavras que sobram têm que estar no nome dele.
  const fraseDoCarro = citada.loja ? citada.restante : dobrar(resto);
  const palavras = fraseDoCarro.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((p) => p.length >= 2 && !PALAVRAS_SOLTAS.has(p));
  if (palavras.length === 0) return null;
  const casam = daLoja.filter((c) => {
    const nome = ` ${dobrar(c.titulo).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
    return palavras.every((p) => nome.includes(` ${p} `) || (p.length >= 4 && nome.includes(p)));
  });
  if (casam.length === 0) return null;
  if (casam.length > 1) {
    const lista = casam.slice(0, 6).map((c, i) => `${i + 1}. ${c.titulo} — ${c.client.companyName}${c.precoCents ? ` (${reais(c.precoCents)})` : ""}`);
    return {
      resposta: `Achei ${casam.length} carros assim sem anúncio:\n${lista.join("\n")}${casam.length > 6 ? `\n… e mais ${casam.length - 6}` : ""}\n\nMe manda de novo com o nome mais completo (modelo, ano ou a loja). Ex.: *anunciar ${casam[0].titulo}*.`,
      pendente: null,
    };
  }

  const c = casam[0];
  if (!(await lojaPodeAnunciarAgora(c.clientId))) {
    return {
      resposta: `A *${c.client.companyName}* ainda não tem o "mesmo de sempre" (conjunto e anúncio-base). Sobe o primeiro anúncio dela mandando as fotos pra mim (*subir anúncio*) ou pela tela; depois os próximos eu subo num comando.`,
      pendente: null,
    };
  }
  return {
    resposta:
      `🚗 Vou subir como *rascunho PAUSADO* na Meta:\n\n• *${c.titulo}*${c.anoModelo ? ` (${c.anoModelo})` : ""} — ${c.client.companyName}${c.precoCents ? ` — ${reais(c.precoCents)}` : ""}\n` +
      `• Fotos: até 5, direto do site da loja\n• Legenda: a IA escreve com a voz da loja, com os dados do carro\n• Onde: no "mesmo de sempre" da loja (conjunto e anúncio-base)\n\n` +
      `Não vai ao ar e não gasta nada: você confere e publica no Gerenciador. Confirma? Responde *sim* ou *não*.`,
    pendente: { tipo: "anunciar-do-estoque", carroId: c.id, carro: c.titulo, loja: c.client.companyName, pedido: texto.slice(0, 300) },
  };
}

/** Executa depois do "sim". */
export async function executarAnuncioDoEstoque(pessoa: { id: string; name: string; role: string }, acao: AcaoDeAnuncioDoEstoque): Promise<{ resposta: string; ok: boolean }> {
  const r = await anunciarCarroDoEstoque({ carroId: acao.carroId, pessoa: { id: pessoa.id, role: pessoa.role as "ADMIN", name: pessoa.name }, origem: "whatsapp" });
  if (!r.ok) return { ok: false, resposta: `❌ Não subi o ${acao.carro}.\n${r.erro}` };
  if (r.jaTinha) return { ok: true, resposta: `O ${acao.carro} já tinha rascunho criado. Procura no Gerenciador (anúncio ${r.adId}).` };
  const avisos = (r.avisos ?? []).map((a) => `⚠️ ${a}`).join("\n");
  return {
    ok: true,
    resposta:
      `✅ Rascunho *PAUSADO* criado: *${r.carro}* na *${r.loja}* (${r.formato === "carrossel" ? "carrossel" : "foto única"}, ${r.fotos} ${r.fotos === 1 ? "foto" : "fotos"} do site${r.conjuntoNovo ? `, num conjunto novo (${r.conjuntoNovo}) também pausado` : ""}).\n` +
      `Ele ainda *não está no ar* e não gasta nada. Confere a legenda e publica no Gerenciador:\n${r.linkDoGerenciador ?? ""}\n\n*Legenda:*\n${(r.legenda ?? "").slice(0, 700)}` +
      (avisos ? `\n\n${avisos}` : ""),
  };
}
