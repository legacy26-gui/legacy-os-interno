# Meu Dia — a carteira do gestor numa tela

A tela que o gestor de tráfego abre todo dia. Mudou de cartão grande por
cliente (com formulário dentro) pra **uma linha baixa por cliente**: pra ver o
décimo cliente a pessoa rolava a página, e o que não se vê não se cobra.

Cada linha traz duas informações, e só:

- **a caixinha do dia** — "passei por aqui hoje"
- **os dias sem vender** — nas mesmas cores do Controle de Vendas

A ordem é a fila do dia: primeiro quem falta conferir, e dentro disso quem
está há mais tempo sem vender.

## A caixinha não é a revisão diária

São duas coisas diferentes de propósito:

| | |
| --- | --- |
| **Caixinha do dia** | um clique, todo dia. Diz só que alguém olhou o cliente. |
| **Revisão diária** | o formulário completo, em Gestão de Contas. |

A frase que justifica a caixinha é do Guilherme: *não vamos mais esquecer
clientes de vista*. É lista de chamada, não conferência técnica — e misturar
as duas faria um clique valer por uma revisão de verdade.

## A foto virou semanal, na segunda

A foto da campanha era cobrada **todo dia**, na revisão diária. Virou **uma
por semana**: na segunda-feira a caixinha não fecha sem a foto; nos outros
dias é um clique.

Cobrança diária de foto vira foto repetida só pra fechar o quadrado, e aí o
registro deixa de valer como prova de que alguém olhou de verdade.

Na segunda a caixinha aparece como **câmera** em vez de quadradinho, e escolher
a foto já envia — um passo só, porque isso se repete por cliente.

O dia da semana é calculado em **America/Sao_Paulo**, não em UTC: às 22h de
domingo em Caxias o UTC já virou segunda, e a equipe seria cobrada um dia
antes.

## O placar

A barra é grande de propósito: o número tem que ser lido de longe, antes de a
pessoa começar a rolar a lista. Mostra o **percentual em corpo grande**,
quantos faltam, e fecha em verde quando a carteira inteira foi conferida.

## Os avisos no topo

Antes da lista, o que não pode passar batido:

- **30 dias ou mais sem vender** → "resolver hoje", em vermelho
- **15 a 29 dias** → aviso de atenção

## O alerta chega no celular do gestor

A partir de **15 dias** sem vender, o alerta daquela loja passa a ir também
pro gestor dela — não só pra Andrielli. Aos **30**, o alerta vira urgente e
**não aceita "lembrar amanhã"**: é pra resolver hoje.

Abaixo de 15 dias ninguém é incomodado. Loja que esfriou em 7 dias é trabalho
normal, e avisar ali faria a notificação virar rotina — rotina a gente
desliga.

## O menu do gestor

Alertas · Meu Dia · Marcar Venda · Controle de Vendas. Só isso.

Suporte e Playbooks foram **desligados do sistema inteiro** (lista de cargos
vazia em `MODULE_ACCESS`, que fecha até pro dono). Nada foi apagado: telas,
rotas e dados continuam de pé, e religar é devolver os cargos em duas linhas.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/app/(app)/meu-dia/page.tsx` | a tela e a ordem da fila |
| `src/app/(app)/meu-dia/linha-do-cliente.tsx` | a linha e a caixinha |
| `src/lib/actions/conferencia.ts` | marcar, desmarcar, a foto da segunda |
| `src/lib/dia-da-casa.ts` | que dia é hoje na casa, e se é dia de foto |

Migrações: `20261111120000_cliente_conferido`, `20261111140000_foto_da_segunda`.
