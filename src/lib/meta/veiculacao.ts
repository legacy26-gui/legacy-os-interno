// Por que este anúncio não está rodando.
//
// ── O problema que isto resolve ──────────────────────────────────────────
//
// A tela dizia só duas coisas: rodando, ou "Pausado". E "pausado" cobria
// situações que não têm nada a ver uma com a outra:
//
//   - alguém desligou de propósito → tudo certo, é pra estar assim
//   - a Meta REPROVOU o anúncio → a loja acha que está anunciando e não está
//   - está em análise → vai voltar sozinho, é só esperar
//   - a campanha acima está parada → mexer no anúncio não resolve nada
//   - falta dado de pagamento → não é problema de anúncio, é de conta
//
// Os três do meio são dinheiro parado que ninguém vê. Um anúncio reprovado
// fica no mesmo cinza de um anúncio que foi desligado ontem porque o carro
// vendeu — e aí a loja passa a semana achando que tem entrega no ar.
//
// A Meta já manda isso em `effective_status`, e a varredura já guarda. Só
// não estava chegando na tela.
//
// ── Por que o texto não é o da Meta ──────────────────────────────────────
//
// Porque "PENDING_BILLING_INFO" não diz nada pra quem vende carro. Cada
// estado vira uma frase que diz o que houve E o que fazer — ou que não há
// nada a fazer, que também é informação.

/** O que fazer a respeito. Decide a cor e se vale chamar atenção. */
export type Gravidade = "rodando" | "esperando" | "parado" | "problema";

export interface Veiculacao {
  /** Palavra curta, pra coluna. */
  rotulo: string;
  /** Frase inteira, pro title do mouse. */
  explicacao: string;
  gravidade: Gravidade;
}

const MAPA: Record<string, Veiculacao> = {
  ACTIVE: {
    rotulo: "Ativo",
    explicacao: "Rodando normalmente.",
    gravidade: "rodando",
  },
  PAUSED: {
    rotulo: "Desligado",
    explicacao:
      "Alguém desligou aqui mesmo. É só ligar de volta quando quiser.",
    gravidade: "parado",
  },
  CAMPAIGN_PAUSED: {
    rotulo: "Campanha parada",
    explicacao:
      "Este item está ligado, mas a campanha acima dele está desligada — então nada entrega. Ligue a campanha.",
    gravidade: "parado",
  },
  ADSET_PAUSED: {
    rotulo: "Conjunto parado",
    explicacao:
      "O anúncio está ligado, mas o conjunto dele está desligado — então nada entrega. Ligue o conjunto.",
    gravidade: "parado",
  },
  DISAPPROVED: {
    rotulo: "Reprovado",
    explicacao:
      "A Meta reprovou este anúncio: ele não entrega e não gasta. Veja o motivo no Gerenciador, conserte o texto ou a arte e peça revisão.",
    gravidade: "problema",
  },
  WITH_ISSUES: {
    rotulo: "Com problema",
    explicacao:
      "A Meta apontou um problema que está segurando a entrega. O motivo aparece no Gerenciador.",
    gravidade: "problema",
  },
  PENDING_BILLING_INFO: {
    rotulo: "Falta pagamento",
    explicacao:
      "A conta de anúncio está sem forma de pagamento válida. Não é problema deste anúncio — é da conta, e segura todos.",
    gravidade: "problema",
  },
  PENDING_REVIEW: {
    rotulo: "Em análise",
    explicacao:
      "A Meta está revisando. Costuma liberar sozinho em algumas horas; não precisa mexer.",
    gravidade: "esperando",
  },
  IN_PROCESS: {
    rotulo: "Processando",
    explicacao: "A Meta ainda está preparando. Não precisa mexer.",
    gravidade: "esperando",
  },
  PREAPPROVED: {
    rotulo: "Pré-aprovado",
    explicacao:
      "Liberado em análise prévia; entra no ar quando o agendamento começar.",
    gravidade: "esperando",
  },
  ARCHIVED: {
    rotulo: "Arquivado",
    explicacao:
      "Arquivado na Meta. Não entrega e não volta sem ser desarquivado lá.",
    gravidade: "parado",
  },
  DELETED: {
    rotulo: "Apagado",
    explicacao:
      "Apagado na Meta. Aparece aqui porque ainda tem gasto no período.",
    gravidade: "parado",
  },
  ADSET_PAUSED_BY_AD_REVIEW: {
    rotulo: "Conjunto parado",
    explicacao:
      "A Meta parou o conjunto por causa da revisão de um anúncio dentro dele.",
    gravidade: "problema",
  },
};

/**
 * Lê o estado de veiculação.
 *
 * `efetivo` é o `effective_status`, que já considera a campanha e o conjunto
 * acima. `proprio` é o status do item em si. Quando não temos o efetivo — item
 * antigo, varredura que falhou — cai no próprio, que ao menos distingue
 * ligado de desligado.
 *
 * Estado desconhecido não vira "Ativo" nem "Desligado": vira ele mesmo,
 * escrito. Um rótulo estranho na tela leva alguém a perguntar; um rótulo
 * errado não leva ninguém a lugar nenhum.
 */
export function veiculacaoDe(
  efetivo: string | null | undefined,
  proprio: string | null | undefined,
): Veiculacao {
  const bruto = (efetivo ?? proprio ?? "").toUpperCase();
  if (!bruto) {
    return {
      rotulo: "Sem informação",
      explicacao:
        "Ainda não buscamos o estado deste item na Meta. Use o botão de atualizar.",
      gravidade: "esperando",
    };
  }
  return (
    MAPA[bruto] ?? {
      rotulo: bruto.toLowerCase().replace(/_/g, " "),
      explicacao: `A Meta devolveu o estado "${bruto}", que o sistema ainda não sabe explicar.`,
      gravidade: "esperando",
    }
  );
}

/** Está entregando agora? */
export function estaEntregando(v: Veiculacao): boolean {
  return v.gravidade === "rodando";
}
