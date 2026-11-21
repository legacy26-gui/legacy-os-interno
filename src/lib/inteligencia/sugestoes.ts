import { acharCarro, type AnuncioConhecido } from "@/lib/whatsapp/entender-pedido";
import { precoNoAnuncio } from "@/lib/vendas/interpretar-venda";

// As sugestões da Inteligência Comercial: o estoque do site cruzado com os anúncios, os leads e as vendas.
//
// ── Por que regras, e não "a IA acha" ────────────────────────────────────
//
// Cada sugestão aqui é uma conta que dá pra conferir: "este carro está no site há 52 dias, o anúncio
// dele trouxe 23 leads e não vendeu". O gestor precisa poder olhar e concordar (ou discordar) do motivo,
// e o motivo precisa ser sempre o mesmo pra mesma situação. Um modelo de IA pode, depois, ESCREVER a
// conversa com o cliente em cima destes fatos — mas os fatos saem daqui.
//
// ── Ligar carro a anúncio: só com certeza ────────────────────────────────
//
// O carro do site e o anúncio da Meta não têm um código em comum: o elo é o NOME. A ligação só é feita
// quando ela vale nos dois sentidos — o título do carro acha um anúncio sem dúvida, E o nome desse anúncio
// acha este carro sem dúvida no estoque. Dois Onix no estoque e um anúncio "Onix" não ligam nada: o carro
// fica "incerto", e incerto NUNCA vira "sem anúncio" (seria mandar anunciar o que já está anunciado).
//
// ── O que este arquivo NÃO faz ───────────────────────────────────────────
//
// Não avisa ninguém (nada de push, nada de WhatsApp): é a tela que mostra. Carro que saiu do site só vira
// sugestão quando o ANÚNCIO dele continua gastando — o sumiço em si não é assunto (decisão do Guilherme:
// muito carro sai do site por motivo que não é venda).
//
// Arquivo puro: recebe os dados, devolve as sugestões. Quem busca no banco é sugestoes-da-carteira.ts.

const DIA = 86_400_000;

/** Os números que decidem cada regra. Mudar aqui muda a régua do sistema inteiro. */
export const REGUA = {
  /** Carro que entrou há até isto e não tem anúncio: "acabou de entrar, anunciar". */
  novoDias: 7,
  /** A partir daqui o carro é "parado". */
  paradoDias: 45,
  /** Parado com tantos leads, sem venda: o problema não é tráfego. */
  leadsSemVenda: 15,
  /** Gasto de anúncio sem nenhum lead que já merece olhar (centavos). */
  gastoSemLeadCents: 15_000,
  /** Custo por lead que passa de tantas vezes o da loja. */
  cplVezesDaLoja: 2,
  /** E com pelo menos este gasto, pra não julgar anúncio que mal começou (centavos). */
  gastoMinimoParaCplCents: 10_000,
  /** Diferença entre o preço do site e o escrito no anúncio que vale avisar (centavos). */
  diferencaDePrecoCents: 50_000,
  /** Preço do site acima da FIPE a partir disto vira sugestão (0,10 = 10%). */
  acimaDaFipe: 0.1,
  /** Preço abaixo da FIPE a partir disto vira argumento de venda (só com FIPE exata). */
  abaixoDaFipe: 0.05,
} as const;

export interface CarroDoEstoque {
  id: string;
  titulo: string;
  anoModelo: number | null;
  km: number | null;
  precoCents: number | null;
  url: string;
  primeiraVezEm: Date;
  sumiuEm: Date | null;
  /** O histórico de preço do site, mais antigo primeiro. */
  precos: { precoCents: number; vistoEm: Date }[];
  /** A FIPE (ver src/lib/fipe): "exato", "faixa" (fipeCents..fipeMaxCents) ou "nenhum". */
  fipeTipo?: string | null;
  fipeCents?: number | null;
  fipeMaxCents?: number | null;
  fipeReferencia?: string | null;
}

export interface AnuncioDaLoja {
  adId: string;
  nome: string;
  /** Título e legenda do anúncio. */
  textos: string[];
  /** `effectiveStatus` da Meta: "ACTIVE" é o que está entregando. */
  status: string | null;
  spendCents: number;
  leads: number;
}

export interface DadosDaLoja {
  loja: { id: string; nome: string };
  /** Quando a leitura do site foi ligada: carro que já estava lá nesse dia tem idade desconhecida. */
  estoqueLigadoEm: Date;
  carros: CarroDoEstoque[];
  anuncios: AnuncioDaLoja[];
  /** Os anúncios que já viraram venda registrada (ids), pra não mandar mexer em carro vendido. */
  anunciosVendidos: Set<string>;
}

export type TipoDeSugestao =
  | "anuncio-de-carro-que-saiu"
  | "preco-diferente"
  | "gasto-sem-lead"
  | "lead-sem-venda"
  | "cpl-alto"
  | "acima-da-fipe"
  | "novo-sem-anuncio"
  | "parado-sem-anuncio"
  | "parado"
  | "abaixo-da-fipe";

export interface Sugestao {
  tipo: TipoDeSugestao;
  /** 1 = olhar primeiro. */
  prioridade: number;
  lojaId: string;
  loja: string;
  /** O carro do estoque, quando a sugestão é sobre um. */
  carro: { id: string; titulo: string; url: string; dias: number; diasExatos: boolean } | null;
  /** Os anúncios envolvidos. */
  anuncios: { adId: string; nome: string }[];
  titulo: string;
  /** O porquê, com os números. */
  detalhe: string;
  /** O que fazer. */
  acao: string;
}

export const PRIORIDADE: Record<TipoDeSugestao, number> = {
  "anuncio-de-carro-que-saiu": 1,
  "preco-diferente": 2,
  "gasto-sem-lead": 3,
  "lead-sem-venda": 4,
  "acima-da-fipe": 5,
  "cpl-alto": 6,
  "novo-sem-anuncio": 7,
  "parado-sem-anuncio": 8,
  parado: 9,
  "abaixo-da-fipe": 10,
};

/** O preço do site comparado com a FIPE. `null` quando não dá pra comparar com segurança. */
export function comparacaoComFipe(c: CarroDoEstoque): { pct: number; texto: string } | null {
  if (c.precoCents === null || !c.fipeCents || (c.fipeTipo !== "exato" && c.fipeTipo !== "faixa")) return null;
  const faixa = c.fipeTipo === "faixa" && c.fipeMaxCents;
  // Na faixa, compara com o lado que favorece a loja: acima = acima do MAIOR; abaixo = abaixo do MENOR.
  const acimaDe = faixa ? (c.fipeMaxCents as number) : c.fipeCents;
  const abaixoDe = c.fipeCents;
  const ref = c.fipeReferencia ? ` (${c.fipeReferencia})` : "";
  const fipeTexto = faixa ? `entre ${reais(c.fipeCents)} e ${reais(c.fipeMaxCents as number)} conforme a versão${ref}` : `${reais(c.fipeCents)}${ref}`;
  if (c.precoCents > acimaDe) {
    const pct = (c.precoCents - acimaDe) / acimaDe;
    return { pct, texto: `${Math.round(pct * 100)}% acima da FIPE (site ${reais(c.precoCents)}, FIPE ${fipeTexto})` };
  }
  if (c.precoCents < abaixoDe) {
    const pct = (c.precoCents - abaixoDe) / abaixoDe;
    return { pct, texto: `${Math.abs(Math.round(pct * 100))}% abaixo da FIPE (site ${reais(c.precoCents)}, FIPE ${fipeTexto})` };
  }
  return { pct: 0, texto: `dentro da FIPE (${fipeTexto})` };
}

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/ /g, " ");

const nomeDoCarro = (c: CarroDoEstoque) => (c.anoModelo && !c.titulo.includes(String(c.anoModelo)) ? `${c.titulo} ${c.anoModelo}` : c.titulo);

export type Ligacao =
  | { tipo: "com-anuncio"; anuncios: AnuncioDaLoja[] }
  | { tipo: "sem-anuncio" }
  /** Pode ter anúncio, mas o nome não deixa ter certeza. Não vira sugestão de "anunciar". */
  | { tipo: "incerto" };

/**
 * Qual anúncio é deste carro, só com certeza nos dois sentidos. Ver o comentário do topo.
 * `carros` é o estoque usado na volta (o carro tem que ser o ÚNICO que o nome do anúncio acha).
 */
export function ligarCarroAoAnuncio(carro: CarroDoEstoque, carros: CarroDoEstoque[], anuncios: AnuncioDaLoja[]): Ligacao {
  if (anuncios.length === 0) return { tipo: "sem-anuncio" };
  const conhecidos: AnuncioConhecido[] = anuncios.map((a) => ({ adId: a.adId, nome: a.nome, textos: a.textos }));
  const ida = acharCarro(nomeDoCarro(carro), conhecidos);
  if (ida.candidatos.length === 0) return { tipo: "sem-anuncio" };
  if (!ida.semDuvida || ida.mesmoCarro.length === 0) return { tipo: "incerto" };

  // A volta: o nome do anúncio tem que achar ESTE carro no estoque, e só ele.
  const comoAnuncios: AnuncioConhecido[] = carros.map((c) => ({ adId: c.id, nome: nomeDoCarro(c), textos: [] }));
  const volta = acharCarro(ida.mesmoCarro[0].nome, comoAnuncios);
  if (!volta.semDuvida || volta.mesmoCarro.length !== 1 || volta.mesmoCarro[0].adId !== carro.id) return { tipo: "incerto" };

  const ids = new Set(ida.mesmoCarro.map((a) => a.adId));
  return { tipo: "com-anuncio", anuncios: anuncios.filter((a) => ids.has(a.adId)) };
}

/** As sugestões de uma loja, da mais urgente pra menos. */
export function gerarSugestoes(d: DadosDaLoja, agora: Date = new Date()): Sugestao[] {
  const t = agora.getTime();
  const sugestoes: Sugestao[] = [];
  const base = { lojaId: d.loja.id, loja: d.loja.nome };
  const ligadoEm = d.estoqueLigadoEm.getTime();

  // O custo por lead da loja inteira (anúncios com gasto), pra comparar cada anúncio com a média dela.
  const comGasto = d.anuncios.filter((a) => a.spendCents > 0);
  const gastoTotal = comGasto.reduce((s, a) => s + a.spendCents, 0);
  const leadsTotal = comGasto.reduce((s, a) => s + a.leads, 0);
  const cplDaLoja = leadsTotal >= 3 ? gastoTotal / leadsTotal : null;

  // Só os carros que importam: os que estão no site, e os que saíram nos últimos 30 dias (anúncio que ficou pra trás).
  const relevantes = d.carros.filter((c) => !c.sumiuEm || t - c.sumiuEm.getTime() <= 30 * DIA);

  for (const c of relevantes) {
    const lig = ligarCarroAoAnuncio(c, relevantes, d.anuncios);
    const dias = Math.max(0, Math.floor((t - c.primeiraVezEm.getTime()) / DIA));
    // Carro que já estava no site quando a leitura foi ligada: a idade real é MAIOR que a contada.
    const diasExatos = c.primeiraVezEm.getTime() - ligadoEm > DIA;
    const carro = { id: c.id, titulo: nomeDoCarro(c), url: c.url, dias, diasExatos };
    const diasTexto = `${diasExatos ? "" : "pelo menos "}${dias} ${dias === 1 ? "dia" : "dias"}`;

    if (lig.tipo === "com-anuncio") {
      const ativos = lig.anuncios.filter((a) => a.status === "ACTIVE");
      const vendido = lig.anuncios.some((a) => d.anunciosVendidos.has(a.adId));
      const gasto = lig.anuncios.reduce((s, a) => s + a.spendCents, 0);
      const leads = lig.anuncios.reduce((s, a) => s + a.leads, 0);
      const anuncios = lig.anuncios.map((a) => ({ adId: a.adId, nome: a.nome }));

      // ── O carro saiu do site e o anúncio continua gastando ─────────────
      if (c.sumiuEm) {
        if (ativos.length > 0 && !vendido) {
          const fora = Math.max(1, Math.floor((t - c.sumiuEm.getTime()) / DIA));
          sugestoes.push({
            ...base,
            tipo: "anuncio-de-carro-que-saiu",
            prioridade: PRIORIDADE["anuncio-de-carro-que-saiu"],
            carro,
            anuncios: ativos.map((a) => ({ adId: a.adId, nome: a.nome })),
            titulo: `${carro.titulo}: saiu do site e o anúncio continua no ar`,
            detalhe: `O carro não aparece no site há ${fora} ${fora === 1 ? "dia" : "dias"}, e ${ativos.length === 1 ? "o anúncio dele está" : `${ativos.length} anúncios dele estão`} entregando.`,
            acao: "Confirma com a loja se vendeu. Se vendeu, pausa o anúncio (e registra a venda se foi de lead).",
          });
        }
        continue; // carro fora do site não gera as outras sugestões
      }
      if (vendido) continue;

      // ── O preço escrito no anúncio não é o do site ─────────────────────
      const precoDoAnuncio = precoNoAnuncio(lig.anuncios.flatMap((a) => a.textos));
      if (ativos.length > 0 && precoDoAnuncio !== null && c.precoCents !== null && Math.abs(precoDoAnuncio - c.precoCents) >= REGUA.diferencaDePrecoCents) {
        sugestoes.push({
          ...base,
          tipo: "preco-diferente",
          prioridade: PRIORIDADE["preco-diferente"],
          carro,
          anuncios,
          titulo: `${carro.titulo}: preço do anúncio diferente do site`,
          detalhe: `O anúncio diz ${reais(precoDoAnuncio)} e o site mostra ${reais(c.precoCents)}.`,
          acao: "Confere com a loja qual vale e atualiza a legenda (Meta Ads → a loja → editar legenda).",
        });
      }

      // ── Gastou e não trouxe ninguém ────────────────────────────────────
      if (ativos.length > 0 && leads === 0 && gasto >= REGUA.gastoSemLeadCents) {
        sugestoes.push({
          ...base,
          tipo: "gasto-sem-lead",
          prioridade: PRIORIDADE["gasto-sem-lead"],
          carro,
          anuncios,
          titulo: `${carro.titulo}: ${reais(gasto)} gastos e nenhum lead`,
          detalhe: `O anúncio deste carro já gastou ${reais(gasto)} e não trouxe nenhum lead.`,
          acao: "Troca o criativo (foto/legenda) ou pausa e põe a verba num carro que está gerando contato.",
        });
        continue;
      }

      // ── Traz lead, mas não vende ───────────────────────────────────────
      if (dias >= REGUA.paradoDias && leads >= REGUA.leadsSemVenda) {
        sugestoes.push({
          ...base,
          tipo: "lead-sem-venda",
          prioridade: PRIORIDADE["lead-sem-venda"],
          carro,
          anuncios,
          titulo: `${carro.titulo}: ${leads} leads e ainda não vendeu`,
          detalhe: `Está no site há ${diasTexto}, o anúncio trouxe ${leads} leads (${reais(gasto)} investidos) e não tem venda registrada.`,
          acao: "O tráfego está funcionando: vale conversar com a loja sobre preço, condição e atendimento desses leads.",
        });
        continue;
      }

      // ── Lead caro, comparado com a própria loja ────────────────────────
      if (ativos.length > 0 && cplDaLoja !== null && leads > 0 && gasto >= REGUA.gastoMinimoParaCplCents) {
        const cpl = gasto / leads;
        if (cpl >= cplDaLoja * REGUA.cplVezesDaLoja) {
          sugestoes.push({
            ...base,
            tipo: "cpl-alto",
            prioridade: PRIORIDADE["cpl-alto"],
            carro,
            anuncios,
            titulo: `${carro.titulo}: lead ${Math.round(cpl / cplDaLoja)}x mais caro que a média da loja`,
            detalhe: `Custo por lead ${reais(cpl)} (${leads} leads, ${reais(gasto)}), contra ${reais(cplDaLoja)} na média da loja.`,
            acao: "Testa outro criativo pra este carro, ou revê o preço: carro caro pro público costuma ter lead caro.",
          });
          continue;
        }
      }

      if (dias >= REGUA.paradoDias) {
        sugestoes.push({
          ...base,
          tipo: "parado",
          prioridade: PRIORIDADE.parado,
          carro,
          anuncios,
          titulo: `${carro.titulo}: parado há ${diasTexto}`,
          detalhe: `Tem anúncio (${leads} ${leads === 1 ? "lead" : "leads"}, ${reais(gasto)} investidos)${reducaoDePreco(c)}.`,
          acao: "Hora de renovar: criativo novo, ou conversar com a loja sobre o preço.",
        });
      }
      continue;
    }

    if (c.sumiuEm || lig.tipo === "incerto") continue;

    // ── Sem anúncio ──────────────────────────────────────────────────────
    if (diasExatos && dias <= REGUA.novoDias) {
      sugestoes.push({
        ...base,
        tipo: "novo-sem-anuncio",
        prioridade: PRIORIDADE["novo-sem-anuncio"],
        carro,
        anuncios: [],
        titulo: `${carro.titulo}: entrou no estoque e não tem anúncio`,
        detalhe: `Apareceu no site ${dias === 0 ? "hoje" : `há ${diasTexto}`}${c.precoCents ? ` por ${reais(c.precoCents)}` : ""}.`,
        acao: "Carro novo é o que mais chama lead: sobe o anúncio.",
      });
    } else if (dias >= REGUA.paradoDias) {
      sugestoes.push({
        ...base,
        tipo: "parado-sem-anuncio",
        prioridade: PRIORIDADE["parado-sem-anuncio"],
        carro,
        anuncios: [],
        titulo: `${carro.titulo}: parado há ${diasTexto} e sem anúncio`,
        detalhe: `Está no site há ${diasTexto}${reducaoDePreco(c)} e não achei anúncio dele.`,
        acao: "Anunciar pode girar o carro. Se a loja não quer anunciar este, tudo bem: é só uma sugestão.",
      });
    }
  }

  // ── A FIPE ─────────────────────────────────────────────────────────────
  //
  // Carro que já tem sugestão ganha a frase da FIPE no detalhe (é contexto: "parado há 60 dias e 16% acima da
  // FIPE" diz mais que as duas coisas separadas). Carro sem nenhuma sugestão só vira cartão próprio se estiver
  // bem acima da FIPE, ou abaixo (aí é argumento de venda pro anúncio).
  const porCarro = new Map<string, Sugestao[]>();
  for (const s of sugestoes) if (s.carro) porCarro.set(s.carro.id, [...(porCarro.get(s.carro.id) ?? []), s]);
  for (const c of relevantes) {
    if (c.sumiuEm) continue;
    const f = comparacaoComFipe(c);
    if (!f) continue;
    const doCarro = porCarro.get(c.id);
    if (doCarro?.length) {
      if (f.pct >= REGUA.acimaDaFipe || f.pct <= -REGUA.abaixoDaFipe) for (const s of doCarro) s.detalhe += ` Preço ${f.texto}.`;
      continue;
    }
    const dias = Math.max(0, Math.floor((t - c.primeiraVezEm.getTime()) / DIA));
    const diasExatos = c.primeiraVezEm.getTime() - ligadoEm > DIA;
    const carro = { id: c.id, titulo: nomeDoCarro(c), url: c.url, dias, diasExatos };
    if (f.pct >= REGUA.acimaDaFipe) {
      sugestoes.push({
        ...base,
        tipo: "acima-da-fipe",
        prioridade: PRIORIDADE["acima-da-fipe"],
        carro,
        anuncios: [],
        titulo: `${carro.titulo}: ${Math.round(f.pct * 100)}% acima da FIPE`,
        detalhe: `Preço ${f.texto}.`,
        acao: "Se o carro tem diferencial (km baixo, revisões, único dono), destaca no anúncio. Se não tem e está parado, o preço pode ser o motivo.",
      });
    } else if (f.pct <= -REGUA.abaixoDaFipe && c.fipeTipo === "exato") {
      sugestoes.push({
        ...base,
        tipo: "abaixo-da-fipe",
        prioridade: PRIORIDADE["abaixo-da-fipe"],
        carro,
        anuncios: [],
        titulo: `${carro.titulo}: ${Math.abs(Math.round(f.pct * 100))}% abaixo da FIPE`,
        detalhe: `Preço ${f.texto}.`,
        acao: "\"Abaixo da FIPE\" chama atenção: vale pôr na legenda do anúncio.",
      });
    }
  }

  return sugestoes.sort((a, b) => a.prioridade - b.prioridade || (b.carro?.dias ?? 0) - (a.carro?.dias ?? 0));
}

/** ", e o preço já baixou de R$ 72.900 pra R$ 68.900" — ou nada. */
function reducaoDePreco(c: CarroDoEstoque): string {
  if (c.precos.length < 2 || c.precoCents === null) return "";
  const primeiro = c.precos[0].precoCents;
  if (primeiro <= c.precoCents) return ", sem baixa de preço no site";
  return `, e o preço no site já baixou de ${reais(primeiro)} pra ${reais(c.precoCents)}`;
}
