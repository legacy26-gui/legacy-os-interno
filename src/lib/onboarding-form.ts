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

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    title: "A loja",
    description: "Pra sabermos com quem estamos falando e como te encontrar.",
    fields: [
      { id: "companyName", label: "Nome da loja", type: "text", required: true },
      { id: "contactName", label: "Seu nome (responsável)", type: "text", required: true },
      { id: "phone", label: "WhatsApp", type: "tel", required: true, placeholder: "(45) 99999-9999" },
      { id: "email", label: "E-mail", type: "email" },
      { id: "city", label: "Cidade e estado", type: "text", required: true, placeholder: "Cascavel/PR" },
      { id: "endereco", label: "Endereço da loja", type: "text" },
      { id: "cnpj", label: "CNPJ", type: "text" },
      { id: "instagram", label: "@ do Instagram", type: "text", placeholder: "@sualoja" },
      { id: "site", label: "Site / site de estoque", type: "text" },
    ],
  },
  {
    title: "Como vocês vendem hoje",
    fields: [
      { id: "carrosMes", label: "Quantos carros vocês vendem por mês hoje?", type: "text" },
      { id: "ticketMedio", label: "Valor médio dos carros que mais saem", type: "text", placeholder: "Ex: R$ 60.000" },
      { id: "vendedores", label: "Quantos vendedores atendem?", type: "text" },
      {
        id: "quemAtende",
        label: "Quem responde o WhatsApp dos anúncios?",
        type: "text",
        help: "Nome e telefone de quem vai receber os contatos.",
      },
      { id: "horario", label: "Horário de atendimento", type: "text", placeholder: "Seg a sex 8h-18h, sáb 8h-12h" },
      {
        id: "formasVenda",
        label: "Trabalham com:",
        type: "multi",
        options: ["Financiamento", "Troca na troca", "Consignado", "Entrada facilitada", "À vista somente"],
      },
    ],
  },
  {
    title: "O que anunciar",
    fields: [
      {
        id: "tipoVeiculo",
        label: "O que vocês vendem?",
        type: "multi",
        options: ["Seminovos", "0km", "Motos", "Utilitários", "Caminhões/pesados"],
      },
      { id: "destaques", label: "Quais carros/ofertas você quer destacar agora?", type: "textarea" },
      { id: "regiao", label: "Região que vocês atendem", type: "text", placeholder: "Cascavel e região, até 100km" },
      { id: "diferencial", label: "Por que o cliente compra de vocês e não do concorrente?", type: "textarea" },
      { id: "naoAnunciar", label: "Tem algo que NÃO pode ser anunciado?", type: "textarea" },
    ],
  },
  {
    title: "Verba e metas",
    fields: [
      { id: "verba", label: "Verba mensal prevista pra anúncios", type: "text", placeholder: "Ex: R$ 1.500" },
      { id: "meta", label: "Quantos carros você quer vender por mês com os anúncios?", type: "text" },
      {
        id: "jaAnunciou",
        label: "Já anunciou antes?",
        type: "select",
        options: ["Nunca anunciei", "Já anunciei por conta própria", "Já tive outra agência"],
      },
      { id: "oQueFuncionou", label: "Se já anunciou: o que funcionou e o que não funcionou?", type: "textarea" },
    ],
  },
  {
    title: "Acessos",
    description: "Sem isso não conseguimos subir campanha — se não souber, marque e a gente resolve junto.",
    fields: [
      {
        id: "temBM",
        label: "Tem Gerenciador de Negócios (Business Manager) da Meta?",
        type: "select",
        options: ["Tenho", "Não tenho", "Não sei o que é"],
      },
      { id: "paginaFacebook", label: "Link da página do Facebook", type: "text" },
      {
        id: "instagramProfissional",
        label: "O Instagram está como conta profissional?",
        type: "select",
        options: ["Sim", "Não", "Não sei"],
      },
      { id: "quemAdmin", label: "Quem é o dono/admin dessas contas?", type: "text" },
    ],
  },
  {
    title: "Pra fechar",
    fields: [{ id: "observacoes", label: "Mais alguma coisa que a gente precisa saber?", type: "textarea" }],
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
