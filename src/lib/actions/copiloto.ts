"use server";

import { requireModuleAccess } from "@/lib/dal";
import { responderComoPessoa } from "@/lib/copiloto/responder";
import type { Turno } from "@/lib/copiloto/cerebro";
import type { RespostaDoCopiloto } from "@/lib/copiloto/tipos";

// A porta do Copiloto PELA TELA.
//
// Daqui saiu tudo que não era conferência de acesso: o recorte de carteira, a
// chamada do cérebro e a resolução da ação proposta vivem em
// src/lib/copiloto/responder.ts, porque agora existe uma segunda porta — o
// WhatsApp privado, onde não há sessão de navegador nenhuma.
//
// O que fica aqui é o que só vale pra tela: conferir que quem está logado tem
// acesso ao módulo de clientes. O resto é o mesmo caminho pras duas portas, e
// é assim que elas não podem divergir sobre o que é "a carteira desta
// pessoa".

export async function perguntarAoCopiloto(
  pergunta: string,
  historico: Turno[],
): Promise<RespostaDoCopiloto> {
  const user = await requireModuleAccess("clientes");
  return responderComoPessoa(user, pergunta, historico);
}
