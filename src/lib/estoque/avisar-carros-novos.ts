import "server-only";

import { prisma } from "@/lib/prisma";
import { sugestoesDaCarteira } from "@/lib/inteligencia/sugestoes-da-carteira";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { lojaPodeAnunciarAgora } from "./anunciar-agora";

// Depois de cada leitura do estoque (9h e 15h): carro NOVO no site da loja e SEM anúncio → o gestor de tráfego da loja recebe
// um aviso no WhatsApp com o comando pronto ("anunciar Compass"). Cada carro avisa UMA vez (`avisoNovoEm`), e só depois de a
// mensagem sair: falha de envio deixa o carro pra próxima leitura.
//
// "Novo e sem anúncio" é a regra que já existe nas Sugestões (src/lib/inteligencia/sugestoes.ts: entrou há até 7 dias e nenhum
// anúncio dele, em nenhum status). Aqui só se transforma em mensagem. Nada é criado: o rascunho só sai se a pessoa responder.

const soDigitos = (s: string) => s.replace(/\D/g, "");
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];
const MAX_POR_MENSAGEM = 5;
/** O começo do nome que só ESTE carro tem entre os novos da loja (pelo menos 2 palavras): é o que o comando precisa pra achá-lo. */
export function comandoDoCarro(titulo: string, todos: string[]): string {
  const palavras = titulo.split(/\s+/).filter(Boolean);
  for (let n = Math.min(2, palavras.length); n <= palavras.length; n++) {
    const prefixo = palavras.slice(0, n).join(" ").toLowerCase();
    if (todos.filter((t) => t.toLowerCase().startsWith(prefixo)).length === 1) return palavras.slice(0, n).join(" ");
  }
  return titulo;
}

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export interface ResultadoDosAvisosDeCarroNovo {
  lojas: number;
  avisos: number;
  carros: number;
}

export async function avisarCarrosNovos(agora: Date = new Date()): Promise<ResultadoDosAvisosDeCarroNovo> {
  const recentes = new Date(agora.getTime() - 8 * 86_400_000);
  // Só as lojas que têm carro novo ainda não avisado (o resto nem entra na conta das sugestões).
  const lojas = await prisma.client.findMany({
    where: { managerId: { not: null }, estoqueCarros: { some: { primeiraVezEm: { gte: recentes }, sumiuEm: null, avisoNovoEm: null, rascunhoAdId: null } } },
    select: { id: true, companyName: true, manager: { select: { id: true, name: true, whatsapp: true, active: true } } },
  });
  const r: ResultadoDosAvisosDeCarroNovo = { lojas: 0, avisos: 0, carros: 0 };

  for (const l of lojas) {
    const g = l.manager;
    if (!g?.active || !g.whatsapp || soDigitos(g.whatsapp).length < 10) continue;
    r.lojas++;
    // Pseudo-ADMIN só pra ler as sugestões DESTA loja (o recorte é o clientId; quem recebe é o gestor dela).
    const { lojas: resultado } = await sugestoesDaCarteira({ id: g.id, role: "ADMIN" }, { clientId: l.id, agora });
    const novos = (resultado[0]?.sugestoes ?? []).filter((s) => s.tipo === "novo-sem-anuncio" && s.carro);
    if (novos.length === 0) continue;

    const ids = novos.map((s) => s.carro!.id);
    const aindaSemAviso = await prisma.estoqueCarro.findMany({ where: { id: { in: ids }, avisoNovoEm: null, rascunhoAdId: null }, select: { id: true, precoCents: true, titulo: true } });
    if (aindaSemAviso.length === 0) continue;
    const mostrados = aindaSemAviso.slice(0, MAX_POR_MENSAGEM);
    const pode = await lojaPodeAnunciarAgora(l.id);

    const linhas = mostrados.map((c) => `• *${c.titulo}*${c.precoCents ? ` — ${reais(c.precoCents)}` : ""}`);
    const texto =
      `🚗 *Carro novo no estoque da ${l.companyName}, sem anúncio:*\n${linhas.join("\n")}${aindaSemAviso.length > mostrados.length ? `\n… e mais ${aindaSemAviso.length - mostrados.length}` : ""}\n\n` +
      (pode
        ? `Quer que eu suba como *rascunho pausado* (fotos do site + legenda da IA)? Responde *anunciar ${comandoDoCarro(mostrados[0].titulo, aindaSemAviso.map((c) => c.titulo))}*, ou usa o botão *Anunciar agora* em Inteligência Comercial → Sugestões. Nada vai ao ar sem você publicar.`
        : `Essa loja ainda não tem o "mesmo de sempre" pra eu subir sozinho: sobe o primeiro anúncio dela mandando as fotos pra mim (*subir anúncio*) ou pela tela, e os próximos saem num comando.`);

    try {
      const e = await enviarTexto(soDigitos(g.whatsapp), `Oi, ${primeiroNome(g.name)}!\n\n${texto}`);
      if (!e.ok) continue;
    } catch {
      continue;
    }
    await prisma.estoqueCarro.updateMany({ where: { id: { in: aindaSemAviso.map((c) => c.id) } }, data: { avisoNovoEm: agora } });
    r.avisos++;
    r.carros += aindaSemAviso.length;
  }
  return r;
}
