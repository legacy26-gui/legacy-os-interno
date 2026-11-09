import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { avisarPessoas, pushConfigurado, type AvisoPush } from "@/lib/push";
import { EMPRESA_CURTA, veTodasAsEmpresas } from "@/lib/empresa";
import { calcularTodosOsAlertas } from "./calcular";
import { alertaEDaPessoa, podeVerAlerta, recebeAlgumAlerta, ehODono, type Pessoa } from "./destinatarios";
import {
  ROTULO_DO_TIPO,
  piorPrimeiro,
  type Alerta,
  type AlertaNaTela,
  type TipoDeAlerta,
} from "./tipos";

// O robô e a leitura da central.
//
// Duas funções fazem o trabalho:
//
//   rodarAlertas()    o robô. Roda 1x por dia, decide o que vibra no celular
//                     de quem, e guarda o que já avisou.
//   meusAlertas()     o que a pessoa vê na tela, agora, calculado na hora.
//
// A tela NÃO depende do robô. Se o robô parar, a central continua certa — só
// para de avisar no celular. É de propósito: a parte que mais tem como falhar
// (o agendamento, que vive fora do sistema) é a que menos faz falta.

function diaCurto(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ──────────────────────────────── A tela ───────────────────────────────────

export interface AlertasDivididos {
  /** Pra agir hoje. */
  ativos: AlertaNaTela[];
  /** Guardados pelo "lembrar amanhã" — continuam existindo, só saíram da frente. */
  silenciados: AlertaNaTela[];
}

async function montarParaTela(
  pessoa: Pessoa,
  alertas: Alerta[],
  agora: Date
): Promise<AlertasDivididos> {
  const estados = await prisma.alertaEstado.findMany({
    where: { userId: pessoa.id, chave: { in: alertas.map((a) => a.chave) } },
    select: { chave: true, nivelVisto: true, silenciadoAte: true },
  });
  const porChave = new Map(estados.map((e) => [e.chave, e]));

  const ativos: AlertaNaTela[] = [];
  const silenciados: AlertaNaTela[] = [];

  for (const a of alertas) {
    const e = porChave.get(a.chave);
    const quieto = !!e?.silenciadoAte && e.silenciadoAte > agora;
    const naTela: AlertaNaTela = {
      ...a,
      silenciado: quieto,
      silenciadoAte: quieto ? diaCurto(e!.silenciadoAte!) : null,
      // "Novo" aqui é novo PRA ELA DENTRO DO SISTEMA, e não "ainda não foi pro
      // celular". Se fosse o celular, bastaria o push não estar configurado
      // pra tudo ficar novo pra sempre.
      novo: a.nivel > (e?.nivelVisto ?? 0),
    };
    (quieto ? silenciados : ativos).push(naTela);
  }

  ativos.sort(piorPrimeiro);
  silenciados.sort(piorPrimeiro);
  return { ativos, silenciados };
}

/**
 * Os alertas de quem está logado.
 *
 * Em cache por requisição: o sininho no cabeçalho e a tela de Alertas pedem a
 * mesma coisa na mesma carregada de página, e sem isso a conta sairia duas
 * vezes em cada clique do sistema.
 */
export const meusAlertas = cache(async (hoje: Date = new Date()): Promise<AlertasDivididos> => {
  const user = await getCurrentUser();
  const todos = await calcularTodosOsAlertas(hoje);
  return montarParaTela(user, todos.filter((a) => alertaEDaPessoa(user, a)), hoje);
});

/**
 * Tudo que a equipe está vendo, pro dono acompanhar sem receber no celular.
 *
 * Note que isto passa por `podeVerAlerta` e não por "mostra tudo": nem o dono
 * atravessa a separação das empresas. Se um dia ele deixar de ter uma das
 * empresas na conta dele, o alerta daquela empresa desaparece daqui também.
 *
 * E é `ehODono`, não "é ADMIN": o sócio do Treinamentos também é ADMIN no
 * sistema, e a visão do que a equipe da agência está fazendo não é dele.
 */
export async function alertasDaEquipe(hoje: Date = new Date()): Promise<AlertasDivididos> {
  const user = await getCurrentUser();
  if (!ehODono(user)) return meusAlertas(hoje);
  const todos = await calcularTodosOsAlertas(hoje);
  return montarParaTela(user, todos.filter((a) => podeVerAlerta(user, a)), hoje);
}

/**
 * Marca como vistos os alertas que a pessoa tem agora.
 *
 * Chamado quando ela abre o painel do sininho ou a tela de Alertas — é o que
 * faz o "novo" e o aviso de canto pararem de aparecer. Não mexe em
 * `nivelAvisado`: ver na tela não substitui o aviso no celular, que é o que
 * alcança quem não está com o sistema aberto.
 *
 * Grava só o que mudou: na maioria das aberturas não há nada novo, e aí não
 * escreve nada no banco.
 */
export async function marcarComoVistos(pessoa: Pessoa, hoje: Date = new Date()): Promise<number> {
  const { ativos, silenciados } = await montarParaTela(
    pessoa,
    (await calcularTodosOsAlertas(hoje)).filter((a) => alertaEDaPessoa(pessoa, a)),
    hoje
  );
  const novos = [...ativos, ...silenciados].filter((a) => a.novo);
  if (novos.length === 0) return 0;

  await prisma.$transaction(
    novos.map((a) =>
      prisma.alertaEstado.upsert({
        where: { userId_chave: { userId: pessoa.id, chave: a.chave } },
        update: { nivelVisto: a.nivel, vistoEm: hoje },
        create: { userId: pessoa.id, chave: a.chave, nivelVisto: a.nivel, vistoEm: hoje },
      })
    )
  );
  return novos.length;
}

// ──────────────────────────────── O robô ───────────────────────────────────

/** O nome do robô dos alertas na tabela de execuções. */
export const ROBO_DOS_ALERTAS = "alertas";

/** Quando o robô passou por aqui pela última vez. Nulo = nunca rodou. */
export async function ultimaConferencia(): Promise<Date | null> {
  const r = await prisma.roboExecucao.findUnique({ where: { nome: ROBO_DOS_ALERTAS } });
  return r?.rodouEm ?? null;
}

export interface ResultadoDoRobo {
  /** Quantos problemas o sistema encontrou, somando todo mundo. */
  problemas: number;
  /** Quantas pessoas tinham algo novo pra saber. */
  pessoasAvisadas: number;
  /** Quantos avisos saíram (um por pessoa por tipo de alerta). */
  avisos: number;
  /** Quantos aparelhos receberam de fato. */
  aparelhos: number;
  pushConfigurado: boolean;
}

/** O texto que chega no celular. Um aviso por tipo, não um por problema. */
function resumoDoPush(
  tipo: TipoDeAlerta,
  alertas: Alerta[],
  mostrarEmpresa: boolean
): AvisoPush {
  const primeiro = alertas[0];
  const marca = mostrarEmpresa ? `[${EMPRESA_CURTA[primeiro.empresa]}] ` : "";

  // Um problema só: dá o nome. Vários: dá o número e os primeiros nomes — é o
  // que cabe na tela de bloqueio sem virar parede de texto.
  const titulo =
    alertas.length === 1
      ? `${marca}${ROTULO_DO_TIPO[tipo]}`
      : `${marca}${alertas.length} × ${ROTULO_DO_TIPO[tipo]}`;

  const corpo =
    alertas.length === 1
      ? [primeiro.titulo, primeiro.detalhe].filter(Boolean).join(" — ")
      : alertas
          .slice(0, 3)
          .map((a) => a.titulo)
          .join(", ") + (alertas.length > 3 ? ` e mais ${alertas.length - 3}` : "");

  return {
    titulo,
    corpo,
    url: primeiro.link,
    // Mesma tag = o celular TROCA o aviso antigo em vez de empilhar. Sem isso,
    // uma semana sem olhar o telefone viraria sete avisos iguais na tela.
    tag: `alertas:${tipo}`,
  };
}

/**
 * O robô. Olha os problemas, decide quem precisa saber, avisa no celular e
 * anota o que avisou.
 *
 * Pode rodar quantas vezes quiser no mesmo dia: só avisa o que ainda não
 * avisou, ou o que piorou de gravidade desde a última vez. É isso que permite
 * ter o botão "rodar agora" sem risco de encher o celular de ninguém.
 */
export async function rodarAlertas(hoje: Date = new Date()): Promise<ResultadoDoRobo> {
  const todos = await calcularTodosOsAlertas(hoje);

  const equipe = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true, empresas: true },
  });
  // Quem não é dono de nenhum tipo de alerta não é nem consultado.
  const donos = equipe.filter(recebeAlgumAlerta);

  const resultado: ResultadoDoRobo = {
    problemas: todos.length,
    pessoasAvisadas: 0,
    avisos: 0,
    aparelhos: 0,
    pushConfigurado: pushConfigurado(),
  };

  for (const pessoa of donos) {
    const meus = todos.filter((a) => alertaEDaPessoa(pessoa, a));
    if (meus.length === 0) continue;

    const estados = await prisma.alertaEstado.findMany({
      where: { userId: pessoa.id, chave: { in: meus.map((a) => a.chave) } },
      select: { chave: true, nivelAvisado: true, silenciadoAte: true },
    });
    const porChave = new Map(estados.map((e) => [e.chave, e]));

    const aAvisar = meus.filter((a) => {
      const e = porChave.get(a.chave);
      // Pediu pra lembrar depois: fica quieto até lá.
      if (e?.silenciadoAte && e.silenciadoAte > hoje) return false;
      // O coração do anti-spam: só avisa de novo quando PIORA.
      return a.nivel > (e?.nivelAvisado ?? 0);
    });
    if (aAvisar.length === 0) continue;

    // Quem só trabalha numa empresa não precisa ler o nome dela em cada aviso.
    const mostrarEmpresa = veTodasAsEmpresas(pessoa.empresas);

    const porTipo = new Map<TipoDeAlerta, Alerta[]>();
    for (const a of aAvisar) {
      const lista = porTipo.get(a.tipo) ?? [];
      lista.push(a);
      porTipo.set(a.tipo, lista);
    }

    let chegouEmAlgumAparelho = false;
    for (const [tipo, lista] of porTipo) {
      lista.sort(piorPrimeiro);
      const entregues = await avisarPessoas([pessoa.id], resumoDoPush(tipo, lista, mostrarEmpresa));
      resultado.avisos++;
      resultado.aparelhos += entregues;
      if (entregues > 0) chegouEmAlgumAparelho = true;
    }

    // Só anota "já avisei" se o aviso chegou em algum aparelho de verdade.
    //
    // Importa: enquanto o push não estiver configurado, ou enquanto a pessoa
    // não tiver instalado o app, nada é anotado — então no dia em que ela
    // instalar, ela recebe o que estava pendente em vez de nunca receber nada.
    if (chegouEmAlgumAparelho) {
      resultado.pessoasAvisadas++;
      await prisma.$transaction(
        aAvisar.map((a) =>
          prisma.alertaEstado.upsert({
            where: { userId_chave: { userId: pessoa.id, chave: a.chave } },
            update: { nivelAvisado: a.nivel, avisadoEm: hoje },
            create: { userId: pessoa.id, chave: a.chave, nivelAvisado: a.nivel, avisadoEm: hoje },
          })
        )
      );
    }
  }

  // Deixa o carimbo da passagem: a tela mostra "conferido às 8h03", e a porta
  // do robô usa isto como acelerador contra chamada repetida de fora.
  await prisma.roboExecucao.upsert({
    where: { nome: ROBO_DOS_ALERTAS },
    update: { rodouEm: hoje },
    create: { nome: ROBO_DOS_ALERTAS, rodouEm: hoje },
  });

  return resultado;
}
