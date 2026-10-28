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
