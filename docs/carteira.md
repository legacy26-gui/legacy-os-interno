# Cada um só vê o seu

Gestor de tráfego enxerga os clientes sob a gestão dele. Gerência e dono
enxergam a casa inteira — a Andrielli entra aqui pelo cargo, que é **Gerente**.

A regra mora em `src/lib/carteira.ts`, junto da definição de quem conta como
cliente. É a mesma família de pergunta, e precisa valer em toda tela que
mostra cliente. Regra de acesso copiada em sete lugares vira sete regras
diferentes em seis meses.

```
veTodaACarteira(user)        quem vê tudo
escopoDaCarteira(user)       o recorte pro `where` do Prisma
clienteEDaCarteira(user, id) a trava das ações que gravam
```

## Filtrar a lista não protege nada

Esse é o ponto que mais importa. Esconder o cliente da lista não impede
ninguém de abrir a ficha dele digitando o endereço — e a ficha tem telefone,
contrato, histórico e faturamento.

Por isso o `id` e o recorte vão **na mesma consulta**, em toda ficha:

```ts
prisma.client.findFirst({ where: { id, ...escopoDaCarteira(user) } })
```

E o que não é dele responde **404**, não "acesso negado": "acesso negado"
confirma que aquele cliente existe, e isso já é informação que não é dela.

## Onde vale

| Tela | O que muda pro gestor |
| --- | --- |
| Clientes | lista e contadores das abas |
| Ficha do cliente e edição | 404 no que não é dele |
| Gestão de Contas | lista e ficha |
| Checklist de hoje | só o dele, não o da equipe |
| Ranking de Lojas | só as lojas dele |
| Controle de Vendas | só as lojas dele, e sem tirar do controle |
| Marcar Venda | só as lojas dele |
| Operações | só as contas dele |
| Meu Dia | já era por gestor desde sempre |

## E nas ações que gravam

Tela recortada não basta: o id vem do navegador. Levam a mesma trava —
editar e apagar cliente, histórico, anexos, marcar visita, e lançar, corrigir
ou apagar venda (inclusive pelo caminho antigo, na ficha do cliente).

`getAccountsHealth(user)` exige a pessoa como primeiro argumento de propósito:
deixar o recorte opcional seria convidar a esquecer, e quem esquece ali abre a
casa inteira sem ninguém notar.

## O que o gestor continua vendo

Dashboard, Alertas, Meu Dia, Playbooks, Suporte, Tráfego, Relatórios e
Marketing. Calendário e Gravações ficaram fechados pro cargo; Financeiro, DRE,
DFC, Análise, Contratos, Comercial, Equipe, Configurações e Formulários já
eram fechados antes.
