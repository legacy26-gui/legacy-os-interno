# Controle de vendas

Tela que responde uma pergunta só, de longe: **quem parou de vender?**

Fica em **Operacional → Controle de Vendas**. Uma linha por loja da carteira,
ordenada pela que está há mais tempo sem vender — a que precisa de ação hoje
aparece primeiro.

A venda aqui é a **venda do carro**, lançada na Gestão de Contas. É o que a
loja vende, não o que a agência fatura dela.

## As quatro faixas

| Tempo sem vender | Cor | Rótulo |
| --- | --- | --- |
| menos de 7 dias | verde | Vendendo |
| 7 a 14 dias | amarelo | Esfriou |
| 15 a 29 dias | vermelho | Parou |
| **30 dias ou mais** | **preto com alerta amarelo** | Abandonou |

A linha preta tem fundo escuro **e** uma faixa amarela na lateral: no tema
escuro o preto sozinho fica perto demais do fundo da tabela, e essa é
justamente a linha que tem que saltar à vista.

Quando existe alguma loja na faixa preta, aparece um aviso no topo com os
nomes.

Os prazos ficam em `src/lib/controle-vendas.ts`, num lugar só. Mudar é trocar
os três números — a tabela, os cartões de resumo e os textos das faixas leem
de lá.

## Loja que nunca vendeu

Conta desde o dia em que ela virou cliente, não desde uma data fixa. Loja que
entrou ontem e ainda não vendeu fica **verde**, não preta — seria injusto e,
pior, encheria a tela de alarme falso toda vez que entrasse cliente novo.

O texto muda pra "Sem venda desde que entrou (N dias)", mas a cor segue a
mesma régua.

## Os cartões de cima

Os quatro cartões contam quantas lojas estão em cada faixa e **funcionam como
filtro**: clicar em "Abandonou" mostra só as pretas. Clicar de novo tira o
filtro. A busca por nome de loja ou cidade convive com o filtro.

## Quem vê

Mesma permissão da Gestão de Contas, que é onde a venda é lançada. Como
`gestao-contas` não está na lista de liberação do Legacy Treinamentos (ver
`docs/separacao-empresas.md`), esta tela fica fora de lá automaticamente — o
sócio do Treinamentos não a vê nem digitando o endereço.

O valor vendido só aparece pra quem tem acesso ao Financeiro, igual à lista de
Clientes.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/lib/controle-vendas.ts` | os prazos, o cálculo e as cores |
| `src/app/(app)/controle-vendas/page.tsx` | a tela |

Sem migração: usa a tabela de vendas que já existia (`client_sales`).

## Como foi verificado

Dez lojas montadas no banco, uma em cada situação e **uma em cada borda
exata** (6 e 7 dias, 14 e 15, 29 e 30) — é onde esse tipo de regra erra por um
dia. O teste lê a classe de cor do selo de cada linha, não a aparência. Todas
as dez bateram, e a ordenação põe a pior no topo.
