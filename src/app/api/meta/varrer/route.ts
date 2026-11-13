import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { varrerCasa } from "@/lib/meta/varredura";
import { prazoDe } from "@/lib/meta/sincronizar-insights";

// A porta que mantém os números da Meta sempre frescos.
//
// ── Por que esta rota existe, se já havia o robô dos alertas ──────────────
//
// Porque eram duas coisas presas numa só, com relógios diferentes. O robô dos
// alertas roda UMA vez por dia, às 11h UTC, e varria a Meta de carona. Isso
// bastava pro trabalho dele — conferir a casa de manhã — mas deixava a tela
// do Meta Ads com número de até vinte e quatro horas atrás o resto do dia.
//
// Quem abria a tela às cinco da tarde via o saldo das oito da manhã. E como a
// tela não dizia a idade do número, não havia como desconfiar: número velho e
// número de agora tinham a mesma cara.
//
// Separar resolve porque as duas têm ritmo próprio:
//
//   alertas    uma vez por dia. Avisar demais é o jeito mais rápido de fazer
//              a equipe ignorar aviso.
//   varredura  de quinze em quinze minutos. Número velho não incomoda
//              ninguém — ele só mente baixinho.
//
// ── Por que quinze minutos, e não um ──────────────────────────────────────
//
// Tempo real não existe aqui, por dois motivos que não dependem de nós:
//
//   1. A Meta corta quem pergunta demais, por token, e o corte dura horas.
//      Com 42 lojas a duas chamadas cada, de minuto em minuto seriam mais de
//      cinco mil chamadas por hora. A conta fica de castigo até de noite e aí
//      o número não é de quinze minutos atrás: não é de hora nenhuma.
//
//   2. A própria Meta demora a fechar. Gasto aparece em minutos; lead e
//      conversão levam horas pra assentar por causa da atribuição. Perguntar
//      de minuto em minuto devolve o mesmo número sessenta vezes.
//
// Quinze minutos é o ponto em que a tela parece viva e a Meta não reclama.
// O saldo — que é o número que PARA a campanha — nunca fica mais de um quarto
// de hora velho, e é por ele que o sistema existe.

export const dynamic = "force-dynamic";
// Dezenas de contas a duas chamadas cada. A Vercel mata a função quando o
// tempo acaba, sem erro e sem passar por try/catch — por isso o orçamento
// abaixo termina antes.
export const maxDuration = 300;

/** Nome desta rotina na tabela `robo_execucoes`. */
export const ROBO_DA_VARREDURA = "meta-varredura";

/**
 * Sem CRON_SECRET configurado, a rota só trabalha de novo depois disto.
 *
 * Dez e não quinze: o agendador da Vercel não é pontual ao segundo, e um
 * acelerador exatamente do tamanho do intervalo faria a chamada legítima
 * cair fora por meio minuto de atraso — pulando a varredura inteira.
 */
const INTERVALO_SEM_SEGREDO_MIN = 10;

/**
 * Quanto tempo a varredura pode gastar antes de devolver o que conseguiu.
 *
 * Abaixo do `maxDuration` de propósito: ela para sozinha com resposta na mão
 * em vez de ser desligada na tomada no meio de uma gravação. O que não deu
 * tempo fica pra próxima — e como a busca é "mais velha primeiro", a próxima
 * pega exatamente quem ficou pra trás.
 */
const ORCAMENTO_MS = 240_000;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();

  if (segredo) {
    // Com segredo configurado: só o agendador entra.
    if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
      return NextResponse.json({ ok: false, motivo: "segredo-invalido" }, { status: 401 });
    }
  } else {
    // Sem segredo, qualquer um pode bater aqui. O que se ganha com isso é
    // nada: a rota não devolve nome de loja, valor nem alerta — só quantas
    // contas atualizaram. O que se gasta é chamada na Meta, e é isso que o
    // acelerador protege, porque gastar chamada à toa é o caminho pro castigo.
    const ultima = await prisma.roboExecucao.findUnique({
      where: { nome: ROBO_DA_VARREDURA },
    });
    const minutos = ultima ? (Date.now() - ultima.rodouEm.getTime()) / 60_000 : Infinity;
    if (minutos < INTERVALO_SEM_SEGREDO_MIN) {
      // 200 e não 429: a Vercel marcaria a execução como falha, e isto não é
      // falha — é o acelerador fazendo o trabalho dele.
      return NextResponse.json({
        ok: true,
        pulou: "muito-cedo",
        faltamMinutos: Math.ceil(INTERVALO_SEM_SEGREDO_MIN - minutos),
      });
    }
  }

  // Marca ANTES de trabalhar, não depois.
  //
  // Se marcasse depois, duas chamadas que chegassem juntas passariam as duas
  // pelo acelerador e sairiam perguntando à Meta em dobro — que é justamente
  // o que leva a conta pro castigo. Marcar antes também garante que uma
  // varredura que morre no meio não libera outra no mesmo minuto.
  const agora = new Date();
  await prisma.roboExecucao.upsert({
    where: { nome: ROBO_DA_VARREDURA },
    update: { rodouEm: agora },
    create: { nome: ROBO_DA_VARREDURA, rodouEm: agora },
  });

  try {
    const r = await varrerCasa(prazoDe(ORCAMENTO_MS));
    console.log("[meta] varredura de 15 em 15:", JSON.stringify(r));
    // `contas: r` e não `...r`: o resultado da varredura TAMBÉM tem um campo
    // chamado `ok`, e lá ele é a quantidade de contas que deram certo. Espalhar
    // aqui faria a resposta dizer `ok: 25` no lugar de `ok: true`, e quem
    // conferisse `ok === true` leria sucesso como falha. O compilador pegou.
    return NextResponse.json({ ok: true, contas: r });
  } catch (erro) {
    // 500 de propósito: a Vercel marca a execução como falha e o problema
    // aparece no painel, em vez de um "ok" mentiroso a cada quinze minutos.
    console.error("[meta] varredura falhou", erro);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
