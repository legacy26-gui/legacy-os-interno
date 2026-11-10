# Gravações

Onde a equipe marca o que foi gravado, pra qual loja, a que horas e quantos
vídeos saíram — e o que vence pra entregar.

Fica na aba **Gravações**, no menu, logo abaixo do Calendário. São duas telas
separadas de propósito: o Calendário é prazo, contrato, financeiro e férias da
equipe; Gravações é produção de vídeo. Juntos, um escondia o outro.

Quem tem acesso ao Calendário tem acesso às Gravações — é a mesma permissão,
o que inclui o Gestor de Tráfego. Foi feito pra a Andrielli lançar sem
depender de ninguém.

## Como se usa

1. Abre **Gravações** no menu.
2. Escolhe a loja na lista (é a carteira de clientes). Se a loja ainda não está
   cadastrada, escolhe **"Outra loja (digitar o nome)"** e escreve o nome.
3. O dia já vem com hoje e a hora com 09:00 — ajusta se foi outro horário.
4. Põe quantos vídeos saíram daquela ida.
5. Clica em **Registrar gravação**.

Dá pra lançar quantas gravações quiser no mesmo dia, cada uma com seu horário.
A lista mostra o total do dia ("2 gravações · 7 vídeos") e o total do mês no
alto do bloco.

## A loja é escolhida, nunca digitada

Na agência, a loja vem da carteira: digita pra achar (procura por nome **e por
cidade**), clica ou aperta Enter. Campo de texto livre fazia "Jânio", "Janio
Multimarcas" e "janio multi" virarem três lojas.

É o mesmo seletor do Marcar Venda, o mesmo componente
(`src/components/seletor-de-loja.tsx`) — duas buscas de loja diferentes
envelheceriam diferente, e a equipe teria que aprender duas.

Quem ainda não está cadastrado continua tendo caminho: o link **"A loja ainda
não está cadastrada"** abre o campo de nome. Fica em segundo plano de
propósito. No Legacy Treinamentos não existe carteira de lojas, então lá o
nome é sempre digitado.

## Quantos carros

Um carro é um vídeo, então o número é um só. A tela oferece de **1 a 10** numa
caixinha: o número é sempre pequeno, e escolher é mais rápido e não erra dedo
que digitar.

## O prazo D+1

Gravou hoje, entrega amanhã. O sistema calcula sozinho e mostra antes de
salvar: *"Entrega em 28/10 (D+1)"*. Quem combinou outro prazo com a loja clica
em **"Combinei outra data"** e escolhe o dia.

A regra mora num lugar só, em `src/lib/gravacoes.ts`. Se um dia virar D+2,
muda ali e muda em todo lugar — inclusive no aviso que aparece na tela antes
de salvar, porque é a mesma função que calcula e que mostra.

## O que aparece no quadro do mês

O quadro no alto da tela é só das gravações — o Calendário geral não mostra
isso, pra cada tela cuidar de um assunto.

- **Roxo (ícone de câmera)** no dia da gravação: `14:30 Jânio Multimarcas — 4 vídeos`
- **Azul (ícone de pacote)** no dia da entrega: `Entregar Jânio Multimarcas — 4 vídeos`

A marca azul some quando a entrega é dada como feita — o quadro mostra o que
ainda se deve, não um histórico. O que foi entregue continua na lista do mês,
marcado em verde.

## Um quadro por dia, embaixo

Abaixo do calendário e do formulário, cada dia tem o **quadro dele**, e o dia
vem pelo nome: **Hoje**, **Amanhã**, **Ontem**. Só depois disso aparece a
data.

Antes era tudo num cartão só, com a data crua no cabeçalho de cada bloco. Ler
"12/11" e descobrir sozinho que aquilo é hoje dá trabalho numa tela que se
consulta às pressas.

A ordem é **uma regra só: do mais recente pro mais antigo**, de cima pra
baixo. Houve uma versão que punha hoje em primeiro, depois o futuro, depois o
passado — e isso não é uma sequência: a lista pulava pra frente e voltava.
Ordem que precisa de explicação não é ordem.

O quadro de **Hoje aparece sempre** no mês corrente, mesmo vazio — dizendo
"Nada gravado hoje ainda". Isso é resposta, não falta de informação: é a
pergunta que a equipe abre a tela pra responder. Mas ele fica no lugar dele na
sequência, sem furar fila. Hoje ganha a borda e o título na cor do sistema,
porque num empilhado de quadros iguais achar o de hoje não pode exigir
leitura.

Em mês antigo não existe "hoje", então lá são só os dias que tiveram gravação.

## Clicar num dia abre aquele dia

Clicar num dia do quadro do mês abre **só aquele dia** lá embaixo, e o dia fica
marcado no calendário. Clicar de novo (ou em "Ver todos os dias") fecha.

O dia aberto responde as **duas** coisas que acontecem num dia, porque o quadro
do mês marca as duas:

- **Gravado nesse dia** — o que foi produzido
- **A entregar nesse dia** — o que vence ali

São assuntos diferentes: um é produção, o outro é dívida. Como o prazo é D+1, o
que foi gravado hoje aparece como entrega de amanhã — então abrir "amanhã"
mostra a gravação de hoje na segunda seção, que é onde ela pertence.

A seção de entrega só aparece quando há o que entregar, e o que foi gravado no
próprio dia não se repete nela.

Funciona também nos dias vizinhos que o quadro mostra (fim do mês anterior,
começo do seguinte): a busca do dia aberto usa a faixa inteira do calendário,
não só o mês fechado, senão clicar num deles abriria vazio.

## Entregas atrasadas

Quando o prazo venceu e ninguém marcou a entrega, aparece uma faixa vermelha
no alto do bloco: *"1 entrega atrasada: Loja Atrasada (25/10)"*. E a linha da
gravação passa a dizer **"Atrasado — era pra entregar 25/10"**.

Isso é consultado **separado do mês que está aberto na tela**, de propósito:
dívida não respeita mês. Sem isso, virar a página pra novembro escondia a
entrega de outubro que ninguém fez — que é justamente a que precisa aparecer.
Na mesma faixa aparece também o que vence hoje.

Pra marcar que a entrega saiu, clica no **✓** na linha da gravação. Clicar de
novo desmarca, pra desfazer o engano.

## Corrigir e apagar

O lápis abre a linha pra corrigir loja, dia, hora, quantidade, prazo e
observação. **Corrigir qualquer um da equipe pode** — é registro do trabalho de
todos, e quem está de plantão tem que conseguir arrumar um número errado sem
caçar quem lançou.

**Apagar é só de quem lançou, ou do administrador**, e o botão fica dentro do
"corrigir" — não existe lixeira à mão de distância na lista do dia a dia. O
servidor confere o dono de novo; esconder o botão é só pra não mostrar o que
não funciona.

## A entrega aparece na ficha do cliente

Dar baixa na entrega faz a ficha do cliente mostrar **"última gravação
entregue"**, com a data, há quantos dias e quantos carros.

Não é campo novo nem coisa pra alguém preencher: a baixa já é o registro. Dado
que se digita em dois lugares desencontra num deles.

Isso existe porque ficar sem vídeo novo é um dos três motivos de uma loja
parar de vender — junto com arte gasta e comercial travado.

## Separação por empresa

A gravação nasce na empresa que está aberta no seletor do topo. Com o Legacy
Treinamentos aberto, a lista de lojas não aparece (carteira de loja é da
agência) e o nome é sempre digitado.

Como em todo o resto do sistema, o filtro vale na consulta ao banco: corrigir
ou apagar manda a empresa junto do id, então não dá pra mexer na gravação da
outra empresa passando o id na mão.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `prisma/schema.prisma` → `model Gravacao` | a tabela |
| `src/lib/gravacoes.ts` | a regra do D+1, usada no servidor e na tela |
| `src/lib/actions/gravacoes.ts` | criar, corrigir, marcar entregue, apagar |
| `src/app/(app)/gravacoes/page.tsx` | a tela: quadro do mês, avisos e lista |
| `src/app/(app)/gravacoes/gravacao-form.tsx` | o formulário de lançar |
| `src/app/(app)/gravacoes/gravacao-linha.tsx` | a linha da lista e a correção |

Migração: `20261027120000_gravacao_de_videos`.
