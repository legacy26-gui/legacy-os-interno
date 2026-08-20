// Perguntas do formulário de entrada de cliente novo.
//
// ESTE É O ÚNICO ARQUIVO QUE PRECISA MUDAR PRA TROCAR AS PERGUNTAS.
// O formulário público, a validação e a tela interna são montados a partir
// daqui — não existe migration nem HTML pra mexer quando a pergunta muda.
//
// Os ids abaixo são especiais: além de irem pras respostas, eles preenchem as
// colunas do registro (é o que aparece na lista e na busca). Mantenha-os.

export const CAMPOS_PRINCIPAIS = ["companyName", "contactName", "phone", "email", "city"] as const;

export type OnboardingFieldType = "text" | "textarea" | "tel" | "email" | "number" | "select" | "multi";

export interface OnboardingField {
  id: string;
  label: string;
  type: OnboardingFieldType;
  required?: boolean;
  options?: string[];
  help?: string;
  placeholder?: string;
}

export interface OnboardingSection {
  title: string;
  description?: string;
  fields: OnboardingField[];
}

const SIM_NAO = ["Sim", "Não"];

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    title: "A loja",
    fields: [
      { id: "companyName", label: "Nome da loja", type: "text", required: true },
      { id: "contactName", label: "Nome do proprietário/responsável", type: "text", required: true },
      { id: "city", label: "Cidade/Estado", type: "text", required: true, placeholder: "Cascavel/PR" },
      { id: "instagram", label: "Instagram da loja", type: "text", placeholder: "@sualoja" },
      { id: "site", label: "Site da loja", type: "text" },
    ],
  },
  {
    title: "Estoque e vendas",
    fields: [
      { id: "estoqueAtual", label: "Quantos veículos vocês possuem em estoque atualmente?", type: "text" },
      { id: "vendasMes1", label: "Quantos veículos foram vendidos no último mês?", type: "text" },
      { id: "vendasMes2", label: "Quantos veículos foram vendidos há 2 meses?", type: "text" },
      { id: "vendasMes3", label: "Quantos veículos foram vendidos há 3 meses?", type: "text" },
      { id: "metaMensal", label: "Qual é a meta de vendas mensal da loja?", type: "text" },
      { id: "maiorGiro", label: "Quais veículos/modelos possuem maior giro atualmente?", type: "textarea" },
      {
        id: "veiculosParados",
        label: "Existem veículos parados há muito tempo ou que vocês querem priorizar? Quais?",
        type: "textarea",
      },
    ],
  },
  {
    title: "Equipe e atendimento",
    fields: [
      { id: "qtdVendedores", label: "Quantos vendedores trabalham atualmente na loja?", type: "text" },
      { id: "distribuicaoLeads", label: "Como os leads são distribuídos entre os vendedores?", type: "textarea" },
      {
        id: "preAtendimento",
        label: "Existe alguém responsável pelo pré-atendimento/pré-venda dos leads?",
        type: "select",
        options: SIM_NAO,
      },
      { id: "usaCrm", label: "A loja utiliza CRM para controlar os leads?", type: "select", options: SIM_NAO },
      { id: "qualCrm", label: "Se sim, qual CRM?", type: "text" },
    ],
  },
  {
    title: "Origem dos leads e investimento",
    fields: [
      {
        id: "origemLeads",
        label: "De onde vêm os leads da loja atualmente?",
        type: "multi",
        options: [
          "Meta Ads / Facebook / Instagram",
          "Google Ads",
          "Facebook Marketplace",
          "Webmotors",
          "iCarros",
          "OLX",
          "Site próprio",
          "Instagram / Orgânico",
          "Indicações",
          "Loja física",
          "Outros",
        ],
      },
      { id: "investeTrafego", label: "Quanto a loja investe aproximadamente por mês em tráfego pago?", type: "text" },
      {
        id: "investePortais",
        label: "Quanto a loja investe aproximadamente por mês em portais/classificados?",
        type: "text",
      },
      { id: "canalQueMaisVende", label: "Qual canal vocês acreditam que mais gera vendas atualmente?", type: "text" },
    ],
  },
  {
    title: "Marketing hoje",
    fields: [
      {
        id: "temAgencia",
        label: "Atualmente existe agência, gestor ou profissional responsável pelo marketing da loja?",
        type: "select",
        options: SIM_NAO,
      },
      {
        id: "temSocialMedia",
        label: "Existe alguém responsável pela produção de conteúdo e redes sociais?",
        type: "select",
        options: SIM_NAO,
      },
      {
        id: "avaliacaoAtendimento",
        label: "Como você avalia atualmente o atendimento dos leads pelos vendedores?",
        type: "select",
        options: ["Excelente", "Bom", "Regular", "Ruim", "Não sei avaliar"],
      },
    ],
  },
  {
    title: "Objetivos com a Legacy",
    fields: [
      {
        id: "principalGargalo",
        label: "Na sua opinião, qual é hoje o principal gargalo que impede a loja de vender mais?",
        type: "textarea",
      },
      {
        id: "metaProximosMeses",
        label: "Quantos veículos vocês gostariam de vender por mês nos próximos 3 a 6 meses?",
        type: "text",
      },
      { id: "expectativa", label: "Qual é sua principal expectativa com a Legacy?", type: "textarea" },
      {
        id: "umProblema",
        label: "Se pudéssemos resolver UM problema da sua operação nos próximos meses, qual deveria ser?",
        type: "textarea",
      },
      {
        id: "observacoes",
        label:
          "Existe alguma informação sobre a loja, equipe ou operação que considera importante sabermos antes da reunião?",
        type: "textarea",
      },
    ],
  },
];

export const ONBOARDING_FIELDS: OnboardingField[] = ONBOARDING_SECTIONS.flatMap((s) => s.fields);

export function fieldById(id: string): OnboardingField | undefined {
  return ONBOARDING_FIELDS.find((f) => f.id === id);
}

// Rótulo legível pra uma resposta antiga cuja pergunta já não existe mais —
// respostas guardadas continuam aparecendo mesmo depois que o formulário muda.
export function labelFor(id: string): string {
  return fieldById(id)?.label ?? id;
}

export function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export const ONBOARDING_STATUS_LABELS = {
  NOVO: "Novo",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
} as const;

export const ONBOARDING_STATUS_COLORS = {
  NOVO: "bg-accent/15 text-accent",
  EM_ANDAMENTO: "bg-amber-500/15 text-amber-500",
  CONCLUIDO: "bg-emerald-500/15 text-emerald-500",
} as const;
