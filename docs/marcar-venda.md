# Marcar venda

A tela curta pra quem marca venda o dia inteiro: escolhe a loja, põe o valor,
pronto. Fica ao lado do **Controle de Vendas** no menu.

A venda também continua podendo ser lançada pela ficha do cliente, na Gestão
de Contas. É a mesma venda — só muda o caminho.

## Quem marca o quê

| Quem | Pode marcar para |
| --- | --- |
| Gestor de tráfego | só os clientes sob a gestão dele |
| Andrielli | todas as lojas |
| Dono e gerência | todas as lojas |

Lojas tiradas do Controle de Vendas (consórcio, banco) não aparecem pra
ninguém: são justamente as contas sem "carro vendido" pra marcar, e marcar
venda nelas sujaria o controle que foi limpo de propósito.

Mudar quem marca o quê é mexer em `src/lib/vendas-permitidas.ts`.

## A loja é escolhida, nunca digitada

O que se digita serve **só pra achar** na lista — procura por nome e por
cidade. Enquanto nada for escolhido, não existe loja no formulário, e o botão
não libera.

Isso não é capricho: campo de texto livre faria "Jânio", "Janio Multimarcas"
e "janio multi" entrarem como se fossem três lojas, e o Controle de Vendas
passaria a contar errado sem ninguém perceber.

Dá pra usar só o teclado: digita, seta pra baixo, Enter.

## A trava que vale é a do servidor

A lista limitada na tela é conveniência. A regra de verdade está na ação do
servidor, que confere o id que chegou do navegador **com o mesmo filtro** que
montou a lista.

As duas coisas saem da mesma função de propósito: se fossem duas regras
escritas separadas, uma envelheceria sem a outra — e a que protege é a do
servidor. Forçar na mão o id de uma loja de outro gestor é recusado com "Essa
loja não está na sua lista", e nada é gravado.

Venda com data no futuro também é barrada: é engano de digitação, e engano em
venda faz a loja aparecer "vendendo" sem ter vendido.

## Desfazer

Cada pessoa pode apagar **as vendas que ela mesma marcou** — errar o valor
marcando às pressas é comum, e sem desfazer a saída seria marcar outra venda
por cima.

O `createdById` entra no próprio `where` do delete, em vez de uma conferência
antes: assim não existe janela entre conferir e apagar, e id de venda de outra
pessoa simplesmente não encontra nada.

A lista "Últimas vendas marcadas" também respeita a carteira: ela não pode
virar uma janela pra ver o movimento dos outros.

## Atenção: o caminho antigo não tem essa regra

Pela **Gestão de Contas → ficha do cliente**, qualquer gestor de tráfego
continua podendo lançar venda em qualquer cliente, como sempre foi. A regra
"só os seus clientes" vale nesta tela nova.

Isso foi deixado assim de propósito, pra não mudar o que já funcionava sem
pedido. Se a regra tiver que valer no sistema inteiro, o lugar é
`createClientSale` em `src/lib/actions/client-sales.ts`, usando o mesmo
`filtroDeClientes`.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/lib/vendas-permitidas.ts` | quem pode marcar pra quais lojas |
| `src/lib/actions/marcar-venda.ts` | marcar e desfazer, com a conferência |
| `src/app/(app)/marcar-venda/page.tsx` | a tela |
| `src/app/(app)/marcar-venda/formulario.tsx` | o seletor de loja e o formulário |
| `src/app/(app)/marcar-venda/apagar-venda.tsx` | o desfazer |

Sem migração: a venda continua sendo a mesma `client_sales` de sempre.

## O Controle de Vendas segue a mesma carteira

O Controle de Vendas usa o mesmo recorte (`escopoDaCarteira`): gestor de
tráfego vê só as lojas dele, gerência e dono veem a casa inteira. As duas
telas não podem discordar sobre o que é "seu cliente", então a regra é uma
função só, composta — não copiada.

Quando o gestor está vendo só a carteira dele, a tela diz isso com todas as
letras. Sem essa frase, um gestor com 3 lojas acharia que a agência inteira
tem 3 clientes.

**Tirar loja do controle** ficou só pra quem vê a casa inteira. Com a carteira
recortada, um gestor poderia tirar a própria loja vermelha do controle e ela
sumiria da tela do dono — esconder não é resolver. A lista "Fora do controle"
também só aparece pra quem pode devolver alguém, pra não sobrar botão que não
faz nada.

Os **valores em R$** já eram escondidos de quem não abre o Financeiro, e
continuam.
