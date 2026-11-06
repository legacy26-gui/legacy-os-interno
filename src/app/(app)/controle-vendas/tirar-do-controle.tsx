"use client";

import { EyeOff } from "lucide-react";
import { tirarDoControleDeVendas } from "@/lib/actions/controle-vendas";

// Botão de tirar a loja do Controle de Vendas.
//
// Com confirmação, e a confirmação diz o que NÃO acontece. Já tivemos um
// botão parecido no Financeiro que o Guilherme entendeu como "desligar o
// cliente" — aqui o texto deixa claro que some só desta tela e tem volta.

export function TirarDoControle({ clientId, loja }: { clientId: string; loja: string }) {
  return (
    <form
      action={tirarDoControleDeVendas.bind(null, clientId)}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Tirar "${loja}" do controle de vendas?\n\n` +
              `Serve pra quem não é loja de carro (consórcio, banco), que nunca vai ter venda pra cobrar.\n\n` +
              `Não desliga o cliente: ele continua igual em Clientes, no financeiro e no contrato. ` +
              `Some só desta tela, e volta pela lista "Fora do controle" aqui embaixo.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        title="Tirar do controle de vendas"
        className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground transition-colors"
      >
        <EyeOff size={14} />
      </button>
    </form>
  );
}
