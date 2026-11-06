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
| 15 a 29 dias | vermelho fraco | Parou |
| **30 dias ou mais** | **vermelho sólido com alerta** | Abandonou |

As duas últimas faixas são a mesma cor em volumes diferentes: 15 a 29 dias é
vermelho fraco, 30 ou mais é vermelho cheio. Laranja no meio foi testado e
descartado — no tema escuro ele fica amarronzado e encosta demais no amarelo
de cima, perdendo a separação justamente no meio da escada.

A faixa crítica é vermelho **sólido**, não preto. Preto parecia a escolha
óbvia pra "pior que vermelho", mas numa tela escura o preto é a cor do fundo:
a linha recuava em vez de avançar, e o vermelho de 15 dias parecia mais grave
que o de 30. A mesma cor no volume máximo é o que lê como escalada.

Quando existe alguma loja nessa faixa, aparece um aviso no topo com os nomes.

Os prazos ficam em `src/lib/controle-vendas.ts`, num lugar só. Mudar é trocar
os três números — a tabela, os cartões de resumo e os textos das faixas leem
de lá.

As cores também: são quatro blocos no mesmo arquivo (`ESTILO_DA_LINHA`,
`ESTILO_DO_SELO`, `ESTILO_DO_LINK`, `ESTILO_SECUNDARIO`). A tela não conhece
cor nenhuma, então trocar a escada inteira não encosta nela.

## Loja que nunca vendeu

Conta desde o dia em que ela virou cliente, não desde uma data fixa. Loja que
entrou ontem e ainda não vendeu fica **verde**, não preta — seria injusto e,
pior, encheria a tela de alarme falso toda vez que entrasse cliente novo.

O texto muda pra "Sem venda desde que entrou (N dias)", mas a cor segue a
mesma régua.

## Os cartões de cima

Os quatro cartões contam quantas lojas estão em cada faixa e **funcionam como
filtro**: clicar em "Abandonou" mostra só as críticas. Clicar de novo tira o
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
