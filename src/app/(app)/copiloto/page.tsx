import { Bot } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { aiApiKey, nomeDaVariavelDaChave, AI_CONFIG } from "@/lib/ai/config";
import { Conversa } from "./conversa";

// O Copiloto: perguntar em português sobre os números que já estão aqui.
//
// ── O que ele é, e o que ele não é ───────────────────────────────────────
//
// Ele é um atalho pra perguntas que hoje custam cinco telas e uma planilha:
// "quais lojas estão pior", "onde estou perdendo dinheiro", "a loja X caiu
// em relação à semana passada?".
//
// Ele NÃO é uma fonte de dado. Todo número que ele escreve saiu de uma
// consulta ao banco feita na hora, com a mesma trava de carteira do resto do
// sistema. Ele não enxerga o banco — recebe o resultado pronto e escreve em
// cima. Ver src/lib/copiloto/cerebro.ts.
//
// ── A tela diz de onde veio o número ─────────────────────────────────────
//
// Cada resposta mostra o que foi consultado. Não é enfeite: é a diferença
// entre uma ferramenta em que se confia e uma que responde bonito e ninguém
// sabe conferir.

export const dynamic = "force-dynamic";

export default async function CopilotoPage() {
  const user = await requireModuleAccess("clientes");

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: { companyName: true },
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bot size={20} className="text-accent" /> Copiloto
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Pergunte em português sobre as contas que você acompanha. Todo número
          vem do banco na hora — ele não chuta.
        </p>
      </div>

      <Conversa
        lojas={lojas.map((l) => l.companyName)}
        temChave={aiApiKey() !== null}
        variavelDaChave={nomeDaVariavelDaChave()}
        provedor={AI_CONFIG.provider}
        modelo={AI_CONFIG.model}
      />
    </div>
  );
}
