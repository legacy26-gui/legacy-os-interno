import Link from "next/link";
import { Car, Receipt } from "lucide-react";

// As duas perguntas do controle de vendas.
//
// "Por loja" responde quem PAROU de vender — uma linha por loja, ordenada
// pela mais abandonada. "Venda a venda" responde o que FOI vendido — uma
// linha por venda, da mais recente pra mais antiga.
//
// Duas abas e não uma tela só porque a ordenação de cada uma é o oposto da
// outra: a primeira põe em cima quem não vende há mais tempo, a segunda põe
// em cima a venda mais nova. Espremer as duas numa tabela faria as duas
// responderem mal.
//
// São Links e não botões: cada aba é um endereço, abre em aba nova, volta no
// botão de voltar e pode ser mandada por mensagem.

const ABAS = [
  { href: "/controle-vendas", rotulo: "Por loja", icone: Car },
  { href: "/controle-vendas/vendas", rotulo: "Venda a venda", icone: Receipt },
] as const;

export function AbasDoControle({ ativa }: { ativa: string }) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {ABAS.map((a) => {
        const sim = a.href === ativa;
        const Icone = a.icone;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={sim ? "page" : undefined}
            // A borda de baixo é o que marca a aba ativa, e ela nasce
            // transparente nas outras pra o texto não pular 2px ao trocar.
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              sim
                ? "border-accent text-accent"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            <Icone size={15} />
            {a.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
