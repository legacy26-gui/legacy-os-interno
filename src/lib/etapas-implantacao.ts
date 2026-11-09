// As etapas de implantação de um cliente novo.
//
// ATENÇÃO: esta lista é um ponto de partida montado a partir do que o sistema
// já mostra da operação (contrato, acessos da Meta, grupo, criativos). Não
// veio do Guilherme — ele precisa corrigir. Mudar é mexer só aqui: a tela, a
// barra de progresso e a contagem leem desta lista.
//
// Sem "server-only": a ficha roda no navegador e precisa dos mesmos rótulos.
//
// Tirar uma etapa daqui não apaga o que já foi marcado no banco — a marcação
// fica guardada e volta se a etapa voltar pra lista. Isso é de propósito:
// mexer na lista não pode apagar histórico de trabalho feito.

export interface EtapaImplantacao {
  /** Chave gravada no banco. NÃO mudar depois de usada — é o que liga a
   *  marcação à etapa. Mudar o texto do rótulo é livre. */
  id: string;
  label: string;
  /** Explicação curta, pra quem preenche não ficar na dúvida. */
  dica?: string;
}

export interface FaseDaImplantacao {
  titulo: string;
  etapas: EtapaImplantacao[];
}

export const FASES_DA_IMPLANTACAO: FaseDaImplantacao[] = [
  {
    titulo: "Fechamento",
    etapas: [
      { id: "ficha_conferida", label: "Ficha conferida", dica: "Li as respostas e vi se falta alguma coisa" },
      { id: "cliente_cadastrado", label: "Cliente cadastrado no sistema" },
      { id: "contrato_enviado", label: "Contrato enviado" },
      { id: "contrato_assinado", label: "Contrato assinado" },
      { id: "primeiro_pagamento", label: "Primeiro pagamento confirmado" },
    ],
  },
  {
    titulo: "Acessos",
    etapas: [
      { id: "grupo_criado", label: "Grupo de WhatsApp criado" },
      { id: "acesso_meta", label: "Acesso ao Meta Business recebido" },
      { id: "acesso_instagram", label: "Acesso ao Instagram / página recebido" },
      { id: "pixel_instalado", label: "Pixel instalado e disparando" },
    ],
  },
  {
    titulo: "Subir a operação",
    etapas: [
      { id: "reuniao_alinhamento", label: "Reunião de alinhamento feita" },
      { id: "criativos_aprovados", label: "Criativos aprovados pelo cliente" },
      { id: "campanha_no_ar", label: "Campanha no ar" },
    ],
  },
];

/** Todas as etapas, na ordem, sem as fases. */
export const ETAPAS: EtapaImplantacao[] = FASES_DA_IMPLANTACAO.flatMap((f) => f.etapas);

export const TOTAL_DE_ETAPAS = ETAPAS.length;

export function etapaExiste(id: string): boolean {
  return ETAPAS.some((e) => e.id === id);
}

/**
 * Quantas etapas da lista ATUAL estão concluídas.
 *
 * Conta só as que estão na lista hoje: marcação de etapa que saiu da lista
 * continua no banco, mas não entra no progresso — senão a barra passaria de
 * 100% depois de encurtar a lista.
 */
export function progresso(chavesConcluidas: string[]): { feitas: number; total: number; porcento: number } {
  const marcadas = new Set(chavesConcluidas);
  const feitas = ETAPAS.filter((e) => marcadas.has(e.id)).length;
  return {
    feitas,
    total: TOTAL_DE_ETAPAS,
    porcento: TOTAL_DE_ETAPAS > 0 ? Math.round((feitas / TOTAL_DE_ETAPAS) * 100) : 0,
  };
}
