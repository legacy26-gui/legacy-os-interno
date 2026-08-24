import "server-only";
import { ONBOARDING_SECTIONS, labelFor, formatAnswer } from "@/lib/onboarding-form";
import type { DadosDigitais } from "@/lib/ai/enriquecimento";

// Versão do prompt. Suba quando mudar as instruções — fica gravada em cada
// análise, então dá pra saber com que regra cada diagnóstico foi gerado.
export const PROMPT_VERSION = "2026-08-24.1";

export const SYSTEM_PROMPT = `Você é analista estratégico especializado em operações de lojas de veículos (seminovos e novos). Trabalha para a Legacy Digital, agência que assume a operação de marketing e vendas dessas lojas.

Você analisa a EMPRESA INTEIRA, não só marketing: estoque, giro, vendas, vendedores, atendimento, velocidade de resposta, follow-up, CRM, geração de leads, tráfego pago, marketplaces e portais, investimento, conteúdo, Instagram, Facebook, Google, site, reputação, conversão, processos comerciais, uso de IA, automações e oportunidades de crescimento.

REGRAS DE RACIOCÍNIO — siga à risca:

1. NUNCA invente dados. Use apenas o que foi informado. Se algo não foi informado, diga que precisa ser validado na reunião.
2. Separe com clareza: fato (foi informado), hipótese (sua leitura do que pode estar acontecendo), gargalo (o que trava a operação), oportunidade (o que pode destravar) e recomendação (o que fazer).
3. NÃO assuma que vender pouco significa falta de tráfego. Antes de concluir isso, considere estoque, preço, oferta, atendimento, qualidade e quantidade de vendedores, follow-up, velocidade de resposta, financiamento, reputação, canais usados, mídia e processo comercial.
4. Analise a relação entre estoque atual, média de vendas, meta, quantidade de vendedores, investimento e estrutura comercial. Um número sozinho não diz nada; a relação entre eles diz.
5. Calcule o que der para calcular com os dados informados: média de vendas dos últimos 3 meses, distância entre a venda atual e a meta, giro aproximado do estoque (estoque ÷ vendas por mês), carros por vendedor, investimento por veículo vendido. Mostre a conta quando fizer diferença. Se faltar dado para uma conta, diga que falta.
6. NUNCA invente benchmark de mercado ("o normal do setor é X"). Se não foi informado, não existe.
7. NÃO recomende aumentar investimento só porque a meta é maior. Aumento de verba só se houver evidência de que o gargalo é volume de lead — e diga qual evidência.
8. Aponte desperdício (dinheiro, tempo, lead perdido) sempre que houver sinal.
9. Priorize ações por impacto real na venda, não por facilidade de execução.
10. Se você não tem dados suficientes para uma seção, devolva-a curta e honesta, dizendo o que falta. É melhor pouco e verdadeiro do que muito e inventado.

SOBRE AS OPORTUNIDADES COMERCIAIS (serviços que a Legacy pode vender):
Só aponte uma oportunidade comercial quando existir evidência de problema ou necessidade compatível nos dados. Cada uma precisa citar a evidência que a sustenta. Nunca force venda. Se não houver evidência, devolva a lista vazia.
Exemplos do raciocínio esperado: não usa CRM e tem dificuldade de acompanhar lead → oportunidade de CRM. Reclamação de demora no atendimento → oportunidade de IA/processo de atendimento. Estoque grande e pouca divulgação → oportunidade de conteúdo e distribuição.

TOM: direto, específico, em português do Brasil, linguagem de dono de loja — sem jargão de agência e sem encher linguiça. Cada frase precisa ganhar o seu lugar.`;

function respostasEmTexto(respostas: Record<string, unknown>): string {
  const linhas: string[] = [];
  const conhecidos = new Set<string>();

  for (const secao of ONBOARDING_SECTIONS) {
    const preenchidos = secao.fields.filter((f) => {
      const v = respostas[f.id];
      conhecidos.add(f.id);
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    });
    if (preenchidos.length === 0) continue;
    linhas.push(`\n## ${secao.title}`);
    for (const f of preenchidos) {
      linhas.push(`- ${f.label}: ${formatAnswer(respostas[f.id])}`);
    }
    const vazios = secao.fields.filter((f) => !preenchidos.includes(f));
    if (vazios.length > 0) {
      linhas.push(`- (não respondido: ${vazios.map((f) => f.label).join("; ")})`);
    }
  }

  const extras = Object.keys(respostas).filter((k) => !conhecidos.has(k));
  if (extras.length > 0) {
    linhas.push("\n## Respostas de perguntas antigas do formulário");
    for (const k of extras) linhas.push(`- ${labelFor(k)}: ${formatAnswer(respostas[k])}`);
  }

  return linhas.join("\n");
}

function digitaisEmTexto(dados: DadosDigitais | null): string {
  if (!dados || Object.keys(dados).length === 0) {
    return "\n## Dados digitais (Instagram, Facebook, Google, site)\nAinda não coletados. Não faça suposições sobre presença digital, avaliações ou reputação — trate como informação a levantar.";
  }
  return `\n## Dados digitais coletados\n${JSON.stringify(dados, null, 2)}`;
}

export interface EntradaDiagnostico {
  empresa: string;
  responsavel: string;
  cidade: string | null;
  respostas: Record<string, unknown>;
  dadosDigitais: DadosDigitais | null;
  // Só no plano final
  reuniao?: string | null;
  preDiagnostico?: unknown;
}

export function montarPromptUsuario(entrada: EntradaDiagnostico): string {
  const base = `# Loja analisada
- Nome: ${entrada.empresa}
- Responsável: ${entrada.responsavel}
- Cidade/Estado: ${entrada.cidade ?? "não informado"}

# Respostas do formulário de entrada
${respostasEmTexto(entrada.respostas)}
${digitaisEmTexto(entrada.dadosDigitais)}`;

  if (!entrada.reuniao) {
    return `${base}

# Tarefa
Gere o PRÉ-DIAGNÓSTICO desta loja, antes da reunião de onboarding. Ele será lido pela equipe da Legacy para chegar na reunião sabendo do que falar.

Além do diagnóstico, gere as perguntas que a equipe precisa fazer na reunião — as que realmente mudam a decisão, não perguntas genéricas. O plano de ação aqui é preliminar: ele vale enquanto as hipóteses não forem validadas.`;
  }

  return `${base}

# Pré-diagnóstico gerado antes da reunião
${JSON.stringify(entrada.preDiagnostico ?? {}, null, 2)}

# O que foi levantado na reunião de onboarding
${entrada.reuniao}

# Tarefa
Gere o PLANO DE AÇÃO FINAL desta loja.

Este documento NÃO é uma repetição do pré-diagnóstico. Ele precisa:
1. Usar o que a reunião trouxe de novo — inclusive quando contraria o que o formulário dizia. Em caso de conflito, o que foi dito na reunião vale mais.
2. Preencher "hipoteses_resolvidas": para cada hipótese do pré-diagnóstico, dizer se a reunião confirmou, descartou ou deixou em aberto, e com base em quê.
3. Atualizar gargalos, oportunidades e o plano de ação com o que se sabe agora. O que caiu por terra deve sair; o que apareceu na reunião deve entrar.
4. Em "hipoteses", deixar apenas o que continua sendo suposição depois da conversa.
5. Em "perguntas_onboarding", deixar apenas o que ficou pendente de resposta.`;
}
