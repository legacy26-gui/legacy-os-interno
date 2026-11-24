import "server-only";

import * as z from "zod";
import { gerarJson } from "@/lib/ai/client";
import { CATEGORIAS_EMPRESA, CATEGORIAS_PESSOAL } from "./interpretar-gasto";

// A IA lendo a mensagem do grupo financeiro como um contador leria.
//
// ── Por que a IA, e não mais regras ──────────────────────────────────────
//
// As regras liam palavra por palavra. Funcionavam pra "almoço 45" e quebravam em
// qualquer frase de gente:
//
//   "gastos faltam andrielli e brendon 7.500, tatiana já está paga, igor tbm"
//   "Tatiana salário já está pago : 2300, tira do contas a pagar deste mês"
//
// As duas viraram um GASTO NOVO com a frase inteira de descrição. Pra entender isso é
// preciso saber o que já está anotado (a Tatiana está na lista de contas a pagar?), o
// que "já está pago" quer dizer, e que "tira do contas a pagar" é uma ordem — isso é
// leitura, não palavra-chave.
//
// ── O que a IA NÃO decide sozinha ────────────────────────────────────────
//
// Ela propõe AÇÕES; o código confere antes de mexer no dinheiro (validar-interpretacao):
//   - valor que não está escrito na mensagem é descartado (nada de R$ inventado);
//   - conta e pendência só pelos ids da lista que ela recebeu;
//   - na dúvida ela pergunta, em vez de agir.
// Sem IA (chave ausente, erro), o robô volta pras regras antigas.

export const TIPOS_DE_ACAO = [
  "lancar_gasto",
  "anotar_a_pagar",
  "dar_baixa",
  "ja_estava_pago",
  "remover_a_pagar",
  "atualizar_saldo",
  "decidir_pendente",
  "consultar",
  "nada",
] as const;

const Acao = z.object({
  tipo: z.enum(TIPOS_DE_ACAO),
  descricao: z.string().nullable(),
  /** Em reais (45.9). Só número que ele DISSE. */
  valor: z.number().nullable(),
  categoriaEmpresa: z.enum(CATEGORIAS_EMPRESA).nullable(),
  categoriaPessoal: z.enum(CATEGORIAS_PESSOAL).nullable(),
  destino: z.enum(["empresa", "pessoal", "duvida"]).nullable(),
  treinamentos: z.boolean(),
  /** AAAA-MM-DD: o dia do gasto, ou o vencimento da conta a pagar. */
  dia: z.string().nullable(),
  /** "c1", "c2"… da lista de contas a pagar. */
  contaId: z.string().nullable(),
  /** "p1", "p2"… da lista de perguntas abertas. */
  pendenteId: z.string().nullable(),
  consulta: z.enum(["gastos", "saldo", "a_pagar", "resumo"]).nullable(),
});

export const Interpretacao = z.object({
  acoes: z.array(Acao),
  /** Quando não dá pra agir com segurança: uma pergunta curta, como um colega faria. */
  pergunta: z.string().nullable(),
});

export type AcaoInterpretada = z.infer<typeof Acao>;
export type InterpretacaoDaIa = z.infer<typeof Interpretacao>;

export interface ContextoDoFinanceiro {
  hoje: string; // AAAA-MM-DD
  diaDaSemana: string;
  contasAPagar: { id: string; descricao: string; valorCents: number; vence: string; fixo: boolean }[];
  pendentes: { id: string; descricao: string; valorCents: number }[];
  equipe: string[];
  saldoInformado: boolean;
}

const SISTEMA = `Você é o assistente financeiro do Guilherme, dono da Legacy (agência de marketing de concessionárias). Ele escreve no grupo "Financeiro" do WhatsApp do jeito que fala — informal, às vezes por áudio transcrito — sobre gastos, contas a pagar, pagamentos e o saldo do banco. Leia como um contador experiente leria e devolva as ações a executar.

AÇÕES
- lancar_gasto: dinheiro que JÁ SAIU num gasto NOVO (almoço, uber, mercado, ferramenta). Nunca para algo que está na lista de contas a pagar — aí é dar_baixa ou ja_estava_pago.
- anotar_a_pagar: algo que AINDA vai ser pago neste mês ("faltam", "a pagar", "vou pagar", "vence dia 25"). dia = vencimento se ele disse.
- dar_baixa: ele está pagando AGORA uma conta da lista (contaId). valor só se for diferente do valor da conta (parcial ou outro valor).
- ja_estava_pago: ele avisa que uma conta da lista JÁ ESTAVA paga ("já está pago", "já paguei", "tira do contas a pagar"). contaId obrigatório.
- remover_a_pagar: uma conta da lista não vai ser paga ou foi anotada errada ("não vou pagar", "cancela", "anotei errado").
- atualizar_saldo: ele informa quanto tem no banco/caixa agora. valor negativo se ele disser negativo.
- decidir_pendente: ele responde uma pergunta aberta de "pessoal ou empresa" (pendenteId + destino).
- consultar: ele PERGUNTA algo. consulta = gastos (quanto gastou com algo), saldo (saldo ou projeção, como fecha o mês), a_pagar (o que falta pagar), resumo (visão geral do mês).
- nada: conversa, comentário, agradecimento.

REGRAS
- Uma mensagem pode ter várias ações. Leia cada pedaço da frase.
- Pessoa citada como "já paga", "já está pago", "tbm", "também": NÃO é gasto novo. Se ela está na lista de contas a pagar → ja_estava_pago com o contaId. Se não está → nada (é só informação).
- Nunca invente valor. Use só números que ele escreveu. "andrielli e brendon 7.500" é UMA ação de 7500 para os dois — não divida.
- Conta da lista: compare pelo nome ("Tatiana" casa com "Salário Tatiana"). Se dois itens casam e você não sabe qual, pergunte.
- descricao: curta, como num extrato bancário — "Salário Tatiana", "Almoço com cliente", "Uber com o Igor", "Salários Andrielli e Brendon". NUNCA a frase inteira, nunca palavras como "já está pago", "tira do", "faltam".
- destino de gasto/conta: "pessoal" se ele disse pessoal/particular/pra casa; "empresa" se disse empresa ou é coisa de empresa (salário, comissão, pessoa da equipe, imposto da empresa, software, anúncio, fornecedor, contador); "duvida" se é típico da vida pessoal e ele não disse (mercado, farmácia, roupa, lazer, IPVA).
- categoriaEmpresa e categoriaPessoal: preencha as duas em lançamentos e contas; "Salários" para pagamento de pessoa da equipe.
- treinamentos = true só se ele citar "treinamento(s)" (a empresa Legacy Treinamentos). O padrão é a Agência.
- dia: AAAA-MM-DD quando ele disser (ontem, dia 15, 15/11); senão null.
- Se a mensagem mexe com dinheiro e você NÃO tem certeza do que ele quer, não aja: deixe acoes vazio (ou só as certas) e escreva em "pergunta" uma pergunta curta e natural, citando o que entendeu.
- Campos que não se aplicam: null. treinamentos sempre true/false.

EXEMPLOS (lista de contas: c1 = "Salário Tatiana" R$ 2.300 · c2 = "Salário Andrielli" R$ 3.750)
- "almoço 45, uber 23" → lancar_gasto Almoço 45 (Alimentação, empresa) + lancar_gasto Uber 23 (Transporte/Combustível, empresa)
- "mercado 310" → lancar_gasto Mercado 310, destino duvida
- "gasolina 200 pessoal" → lancar_gasto Gasolina 200, destino pessoal
- "Tatiana salário já está pago: 2300, tira do contas a pagar deste mês" → ja_estava_pago contaId c1
- "gastos faltam andrielli e brendon 7.500, tatiana já está paga, igor tbm" → anotar_a_pagar "Salários Andrielli e Brendon" 7500 (empresa, Salários) + ja_estava_pago c1 (a Tatiana). O Igor não está na lista: nada.
- "paguei a andrielli" → dar_baixa c2 (valor null)
- "paguei 2 mil da andrielli" → dar_baixa c2 valor 2000
- "meu saldo é 21.981" → atualizar_saldo 21981
- "quanto gastei de uber com o igor esse mês?" → consultar gastos
- "como vou fechar o mês?" → consultar saldo
- "o que falta pagar?" → consultar a_pagar
- "a do mercado foi pessoal" (pendência p1 = Mercado) → decidir_pendente p1 pessoal`;

function montarMensagem(texto: string, c: ContextoDoFinanceiro): string {
  const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const contas = c.contasAPagar.length
    ? c.contasAPagar.map((x) => `${x.id} = "${x.descricao}" ${reais(x.valorCents)} · vence ${x.vence}${x.fixo ? " · fixo" : ""}`).join("\n")
    : "(nenhuma)";
  const pend = c.pendentes.length
    ? c.pendentes.map((x) => `${x.id} = "${x.descricao}" ${reais(x.valorCents)}`).join("\n")
    : "(nenhuma)";
  return [
    `Hoje: ${c.hoje} (${c.diaDaSemana}).`,
    `Equipe da empresa: ${c.equipe.join(", ") || "(sem cadastro)"}.`,
    `Saldo do banco já informado: ${c.saldoInformado ? "sim" : "não"}.`,
    "",
    "Contas a pagar abertas:",
    contas,
    "",
    'Perguntas abertas de "pessoal ou empresa":',
    pend,
    "",
    `Mensagem do Guilherme: """${texto}"""`,
  ].join("\n");
}

// ── Gancho de teste ──────────────────────────────────────────────────────
// Os testes rodam sem chave de IA. Este gancho deixa trocar a IA por uma resposta
// pronta — e é a única forma de testar o caminho inteiro (IA → validação → banco).
// Fica no `globalThis` (e não numa variável do módulo) porque o carregador dos testes pode
// ter duas cópias deste arquivo, e o gancho precisa valer nas duas.
type Interprete = (texto: string, contexto: ContextoDoFinanceiro) => Promise<InterpretacaoDaIa | null>;
const CHAVE = "__interpreteFinanceiroDeTeste";
export function usarInterpreteDeTeste(f: Interprete | null) {
  (globalThis as Record<string, unknown>)[CHAVE] = f ?? undefined;
}

/** A IA interpretando. `null` quando ela não está disponível ou falhou — quem chama usa as regras. */
export async function interpretarComIa(texto: string, contexto: ContextoDoFinanceiro): Promise<InterpretacaoDaIa | null> {
  const deTeste = (globalThis as Record<string, unknown>)[CHAVE] as Interprete | undefined;
  if (deTeste) return deTeste(texto, contexto);
  try {
    const r = await gerarJson({ funcao: "financeiro-interpretar", nivel: "simples", system: SISTEMA, user: montarMensagem(texto, contexto), schema: Interpretacao, maxTokens: 3000 });
    return r.dados;
  } catch {
    return null;
  }
}
