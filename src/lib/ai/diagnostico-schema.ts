import * as z from "zod";

// Formato da resposta da IA. É este schema que vai junto na chamada (structured
// output), então o modelo é obrigado a devolver exatamente esta forma — e é o
// mesmo schema que valida o que voltou antes de salvar.

const prioridade = z.enum(["alta", "media", "baixa"]);
const confianca = z.enum(["alto", "medio", "baixo"]);

export const GargaloSchema = z.object({
  nome: z.string(),
  evidencia: z.string(),
  impacto: z.string(),
  nivel_confianca: confianca,
});

export const OportunidadeSchema = z.object({
  oportunidade: z.string(),
  motivo: z.string(),
  impacto_potencial: z.string(),
  prioridade,
});

export const AcaoSchema = z.object({
  acao: z.string(),
  motivo: z.string(),
  responsavel_sugerido: z.string(),
  indicador: z.string(),
  prioridade,
});

export const NumeroSchema = z.object({
  indicador: z.string(),
  valor: z.string(),
  observacao: z.string(),
});

export const HipoteseSchema = z.object({
  hipotese: z.string(),
  como_validar: z.string(),
});

export const OportunidadeComercialSchema = z.object({
  categoria: z.enum([
    "trafego",
    "ia_atendimento",
    "crm",
    "site",
    "social_media",
    "audiovisual",
    "treinamento_vendedores",
    "automacoes",
    "distribuicao",
    "outra",
  ]),
  oportunidade: z.string(),
  evidencia: z.string(),
  prioridade,
});

export const DiagnosticoSchema = z.object({
  resumo_executivo: z.string(),
  numeros_principais: z.array(NumeroSchema),
  pontos_positivos: z.array(z.string()),
  gargalos: z.array(GargaloSchema),
  hipoteses: z.array(HipoteseSchema),
  oportunidades: z.array(OportunidadeSchema),
  perguntas_onboarding: z.array(z.string()),
  plano_acao: z.object({
    primeiros_7_dias: z.array(AcaoSchema),
    primeiros_30_dias: z.array(AcaoSchema),
    dias_30_60: z.array(AcaoSchema),
    dias_60_90: z.array(AcaoSchema),
  }),
  decisoes: z.object({
    parar: z.array(z.string()),
    comecar: z.array(z.string()),
    manter: z.array(z.string()),
    aumentar: z.array(z.string()),
  }),
  oportunidades_comerciais: z.array(OportunidadeComercialSchema),
  alertas: z.array(z.string()),
  // Só no plano final: o que a reunião confirmou ou derrubou das hipóteses.
  // Nulável (e não opcional) porque o modo estrito da OpenAI exige que todo
  // campo exista; no pré-diagnóstico ele vem null.
  hipoteses_resolvidas: z
    .array(
      z.object({
        hipotese: z.string(),
        conclusao: z.enum(["confirmada", "descartada", "segue_em_aberto"]),
        base: z.string(),
      })
    )
    .nullable(),
  proximo_passo: z.string(),
});

export type Diagnostico = z.infer<typeof DiagnosticoSchema>;
export type Gargalo = z.infer<typeof GargaloSchema>;
export type Oportunidade = z.infer<typeof OportunidadeSchema>;
export type Acao = z.infer<typeof AcaoSchema>;
export type OportunidadeComercial = z.infer<typeof OportunidadeComercialSchema>;

export const CATEGORIA_COMERCIAL_LABELS: Record<OportunidadeComercial["categoria"], string> = {
  trafego: "Tráfego pago",
  ia_atendimento: "IA de atendimento",
  crm: "CRM",
  site: "Site",
  social_media: "Social media",
  audiovisual: "Audiovisual",
  treinamento_vendedores: "Treinamento de vendedores",
  automacoes: "Automações",
  distribuicao: "Distribuição",
  outra: "Outra",
};

// Schema de LEITURA: mais tolerante que o de envio. O de envio exige todos os
// campos (é o que o modo estrito dos provedores pede); o de leitura aceita
// análise antiga, gerada quando o formato tinha menos campos.
const DiagnosticoLeituraSchema = DiagnosticoSchema.extend({
  hipoteses_resolvidas: DiagnosticoSchema.shape.hipoteses_resolvidas.nullish().transform((v) => v ?? null),
});

// Aceita um diagnóstico salvo no banco (Json) e devolve tipado, ou null se a
// forma não bate — assim uma análise antiga com formato diferente não quebra a
// tela.
export function parseDiagnostico(valor: unknown): Diagnostico | null {
  const r = DiagnosticoLeituraSchema.safeParse(valor);
  return r.success ? (r.data as Diagnostico) : null;
}
