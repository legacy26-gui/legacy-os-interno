import "server-only";

import * as z from "zod";
import { gerarJson } from "@/lib/ai/client";
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_PESSOAL,
  decidirDestino,
  type GastoLido,
  type PedacoSemCerteza,
} from "./interpretar-gasto";

// A IA, só para o que a leitura por regra não resolveu: a categoria que nenhuma
// palavra conhecida indica ("coisa da loja do Zé 90"), ou o pedaço com dois
// números ("2 cafés 18").
//
// Ela NÃO decide sozinha o destino. Ela diz o que a frase disse ("pessoal",
// "empresa" ou nada) e pra que lado a coisa costuma pender; a decisão passa pela
// mesma `decidirDestino` da leitura por regra. Assim a regra do Guilherme ("na
// dúvida, pergunta") vale igual, com ou sem IA.

const Gasto = z.object({
  descricao: z.string(),
  /** Em reais, com centavos: 45.9. */
  valor: z.number(),
  categoriaEmpresa: z.enum(CATEGORIAS_EMPRESA),
  categoriaPessoal: z.enum(CATEGORIAS_PESSOAL),
  tendencia: z.enum(["empresa", "pessoal", "neutro"]),
  disse: z.enum(["empresa", "pessoal", "nada"]),
  treinamentos: z.boolean(),
  /** AAAA-MM-DD, ou null quando a frase não diz o dia. */
  dia: z.string().nullable(),
});
const Resposta = z.object({ gastos: z.array(Gasto) });

const SISTEMA = `Você lê anotações de gastos que o dono de uma agência de marketing manda no WhatsApp e devolve cada gasto separado.

Regras:
- Um item por gasto. Ignore o que não for gasto (cumprimento, comentário).
- "valor" em reais, número com ponto decimal (45.9). Se houver dois números, o valor é o que tem cara de dinheiro; quantidade ("2 cafés") não é valor.
- "descricao": curta, como ele escreveria, com a primeira letra maiúscula. Sem o valor e sem a data.
- "categoriaEmpresa": a categoria se for gasto da empresa. "categoriaPessoal": a categoria se for gasto pessoal. Preencha as duas sempre. Use "Outros" só se nenhuma servir.
- "tendencia": "empresa" se é coisa típica de empresa (software, imposto da empresa, salário, anúncio); "pessoal" se é típica da vida pessoal (mercado, farmácia, roupa, lazer, casa); "neutro" se serve pros dois (almoço, gasolina, uber).
- "disse": "pessoal" só se a frase DIZ que é pessoal/particular; "empresa" só se DIZ empresa/agência; senão "nada". Não deduza.
- "treinamentos": true só se a frase cita "treinamento(s)".
- "dia": AAAA-MM-DD só se a frase disser o dia (ontem, dia 15, 15/11); senão null. Hoje é {HOJE}.`;

/** Lê com a IA. Devolve `null` se ela não estiver ligada ou falhar — quem chama segue sem. */
export async function lerComIa(
  pedacos: PedacoSemCerteza[],
  hoje: string,
): Promise<GastoLido[] | null> {
  if (pedacos.length === 0) return [];
  try {
    const r = await gerarJson({
      system: SISTEMA.replace("{HOJE}", hoje),
      user: pedacos.map((p) => p.texto).join("\n"),
      schema: Resposta,
      maxTokens: 1500,
    });
    return r.dados.gastos
      .filter((g) => Number.isFinite(g.valor) && g.valor > 0 && g.valor < 10_000_000)
      .map((g) => ({
        descricao: g.descricao.trim().slice(0, 120) || g.categoriaPessoal,
        valorCents: Math.round(g.valor * 100),
        categoriaEmpresa: g.categoriaEmpresa,
        categoriaPessoal: g.categoriaPessoal,
        destino: decidirDestino(g.disse === "nada" ? null : g.disse, g.tendencia),
        empresa: g.treinamentos ? "TREINAMENTOS" : "AGENCIA",
        // Dia que a IA inventou fora do formato ou no futuro vira hoje.
        dia: g.dia && /^\d{4}-\d{2}-\d{2}$/.test(g.dia) && g.dia <= hoje ? g.dia : hoje,
      }));
  } catch {
    return null;
  }
}
