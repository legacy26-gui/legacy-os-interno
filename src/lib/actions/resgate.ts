"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { avisarPessoas } from "@/lib/push";
import { veTodasAsEmpresas } from "@/lib/empresa";

// O que foi feito pra destravar uma loja parada.
//
// Arte é uma data no cliente (igual à última visita). Comercial é log,
// porque o que importa é a sequência: falei dia 12, reuni dia 20.
//
// Vídeo não tem ação aqui de propósito — a gravação se registra em Gravações,
// e um segundo lugar pra dizer a mesma coisa desencontraria num deles.

function revalidar(clientId: string) {
  revalidatePath(`/resolver/${clientId}`);
  revalidatePath("/controle-vendas");
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/meu-dia");
}

async function podeMexer(clientId: string) {
  const user = await requireModuleAccess("gestao-contas");
  // O id vem do navegador: só se mexe em loja da própria carteira.
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

/** Meio-dia: a data é o que importa, e o meio-dia nunca cai no dia errado. */
function hojeMeioDia(): Date {
  const a = new Date();
  return new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate(), 12));
}

// ───────────────────────────────── Arte ────────────────────────────────────

export async function marcarArteRenovada(clientId: string) {
  if (!(await podeMexer(clientId))) return;
  await prisma.client.update({
    where: { id: clientId },
    data: { ultimaArteEm: hojeMeioDia() },
  });
  revalidar(clientId);
}

/** Renovação que aconteceu outro dia. Data vazia limpa o registro. */
export async function definirDataDaArte(clientId: string, data: string) {
  if (!(await podeMexer(clientId))) return;

  if (!data) {
    await prisma.client.update({ where: { id: clientId }, data: { ultimaArteEm: null } });
    revalidar(clientId);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;

  const [ano, mes, dia] = data.split("-").map(Number);
  const quando = new Date(Date.UTC(ano, mes - 1, dia, 12));
  // Arte renovada no futuro é engano de digitação.
  if (quando.getTime() > Date.now() + 86_400_000) return;

  await prisma.client.update({ where: { id: clientId }, data: { ultimaArteEm: quando } });
  revalidar(clientId);
}

// ─────────────────────────────── Comercial ─────────────────────────────────

export type ResgateState = { erro?: string; ok?: string } | undefined;

/** O primeiro contato da escada: ligou, entendeu o que mudou na loja. */
export async function registrarContato(
  clientId: string,
  _anterior: ResgateState,
  formData: FormData
): Promise<ResgateState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  await prisma.acaoDeResgate.create({
    data: {
      clientId,
      tipo: "CONTATO",
      quemId: user.id,
      observacao: ((formData.get("observacao") as string) ?? "").trim() || null,
    },
  });
  revalidar(clientId);
  return { ok: "Contato registrado." };
}

/**
 * A reunião — e o aviso pro dono.
 *
 * Os dois juntos de propósito. "Marcar reunião e avisar" é um movimento só na
 * cabeça de quem faz; separar em dois botões garantiria que um dia alguém faz
 * o primeiro e esquece o segundo.
 *
 * Os dois ficam sabendo, por caminhos diferentes e de propósito: o dono no
 * CELULAR, porque pode estar fora e a decisão é dele; a Andrielli DENTRO do
 * sistema, nos alertas dela, porque o que ela faz com isso (remarcar gravação,
 * renovar arte) é trabalho de tela e não de rua.
 *
 * O aviso falhar não derruba o registro: a reunião aconteceu de qualquer
 * jeito, e perder isso por causa de uma notificação seria o pior negócio.
 */
export async function registrarReuniao(
  clientId: string,
  _anterior: ResgateState,
  formData: FormData
): Promise<ResgateState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  const observacao = ((formData.get("observacao") as string) ?? "").trim() || null;
  const loja = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true },
  });



  // O celular é só do dono: o ADMIN que enxerga o grupo inteiro — a mesma
  // definição que o resto do sistema usa.
  //
  // Lista explícita e não "todo ADMIN": o sócio do Legacy Treinamentos também
  // é ADMIN, e reunião de loja da agência não é assunto dele.
  //
  // A Andrielli não entra aqui: ela é avisada dentro do sistema, por um
  // alerta do tipo "reuniao-marcada" (ver src/lib/alertas/).
  const admins = await prisma.user.findMany({
    where: { active: true, role: "ADMIN" },
    select: { id: true, empresas: true },
  });
  const avisados = admins.filter((a) => veTodasAsEmpresas(a.empresas)).map((a) => a.id);

  let avisou = 0;
  try {
    avisou = await avisarPessoas(avisados, {
      titulo: "Reunião marcada — loja parada",
      corpo: `${loja?.companyName ?? "Loja"} · marcada por ${user.name.split(" ")[0]}${observacao ? ` — ${observacao}` : ""}`,
      url: `/resolver/${clientId}`,
      tag: `resgate:${clientId}`,
    });
  } catch (erro) {
    console.error("[resgate] falhou avisar a reunião", erro);
  }

  // O registro entra DEPOIS do envio pra guardar quantos receberam. A
  // reunião não se perde se o aviso falhar: o catch acima já garantiu isso, e
  // aqui ela é gravada com avisados = 0, que é a verdade.
  await prisma.acaoDeResgate.create({
    data: { clientId, tipo: "REUNIAO", quemId: user.id, observacao, avisados: avisou },
  });

  revalidar(clientId);
  return {
    ok:
      avisou > 0
        ? "Reunião registrada. Guilherme foi avisado no celular e a Andrielli nos alertas dela."
        : "Reunião registrada e a Andrielli avisada nos alertas. O aviso no celular do Guilherme não saiu — fale com ele por fora.",
  };
}

/** Desfazer o registro errado — só o que a própria pessoa lançou. */
export async function apagarResgate(clientId: string, resgateId: string) {
  const user = await podeMexer(clientId);
  if (!user) return;
  await prisma.acaoDeResgate.deleteMany({ where: { id: resgateId, quemId: user.id } });
  revalidar(clientId);
}
