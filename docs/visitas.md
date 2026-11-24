# Última visita na loja

Em **Clientes**, cada loja mostra há quanto tempo alguém da casa não aparece
lá — e tem um botão que marca a visita de hoje com um clique.

## Como se usa

Na lista de Clientes existe a coluna **Última visita**. Em cada linha:

- **"Visitei"** — aperta e marca o dia de hoje. Serve pra ser apertado saindo
  da loja, sem escolher data em lugar nenhum.
- **lápis** — abre um campo de data, pra quando a visita foi outro dia e você
  só lembrou depois. Não aceita data no futuro.

A mesma coisa aparece na ficha do cliente, no cartão **"Última visita na
loja"**, só que maior.

Depois de marcar, o botão vira **"Visitado"** e fica travado até o dia
seguinte — apertar duas vezes no mesmo dia não faz nada.

## O que a cor quer dizer

| O que aparece | Significado |
| --- | --- |
| **Hoje** / **Ontem** / há poucos dias (verde) | visita recente |
| **há 15+ dias** (amarelo) | está ficando tempo demais |
| **há 30+ dias** (vermelho) | abandonado |
| **Sem visita registrada** (cinza) | ninguém marcou visita ainda |

"Sem visita registrada" não quer dizer que nunca se foi na loja — quer dizer
que ninguém apertou o botão. Por isso ela não entra no aviso do topo.

## O aviso no topo

Quando alguma loja passa de 15 dias, aparece uma faixa amarela em Clientes:
*"2 loja(s) sem visita há mais de 15 dias · Garagem do Vale, Auto Center Sul"*.

Conta **só quem tem visita registrada e passou do prazo**. No primeiro dia a
coluna está vazia em todo mundo, e abrir a tela com um aviso de "ninguém foi
visitado" seria barulho sem informação.

Os prazos são do Guilherme: **15 dias vira amarelo, 30 dias vira vermelho**.
Pra mudar, é trocar os dois números no começo de `src/lib/visitas.ts` — a
coluna, o aviso do topo e a ficha do cliente leem de lá, inclusive o número
escrito no texto do aviso.

## Decisões

**Guarda só a data, não o histórico de visitas.** O que se quer responder é
"há quanto tempo não vou lá". Um histórico (quantas visitas no mês, quem foi)
é outra funcionalidade; se for preciso, entra depois sem atrapalhar esta.

**Grava ao meio-dia, não na hora do clique.** A data é o que importa, e meio-dia
nunca cai no dia errado quando a tela é aberta em outro fuso.

**Quem vê Clientes pode marcar.** Visita é fato da operação, não informação
restrita — não faz sentido depender do administrador pra registrar que esteve
na loja.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `prisma/schema.prisma` → `Client.ultimaVisitaEm` | o campo |
| `src/lib/visitas.ts` | "há X dias" e os prazos de 15/30 |
| `src/lib/actions/visitas.ts` | marcar hoje e escrever outra data |
| `src/app/(app)/clientes/visita-cliente.tsx` | o botão e o campo de data |
| `src/app/(app)/clientes/page.tsx` | a coluna e o aviso do topo |
| `src/app/(app)/clientes/[id]/page.tsx` | o cartão na ficha |

Migração: `20261103120000_ultima_visita_ao_cliente`.

## Histórico de visitas em bolha (`src/lib/visitas-registro.ts`, `clientes/historico-da-loja.tsx`)

Botão **Histórico** (ícone de relógio) ao lado das visitas na tabela de Clientes e na ficha da loja. Abre uma **bolha por cima
da tela** (não é aba nova; fecha com X, Esc ou clicando fora) com:

- **cada dia em que a loja foi visitada** (um por dia) e **o que foi falado** nessa visita;
- as **anotações soltas** da loja (as do histórico da ficha), na mesma linha do tempo, da mais nova pra mais antiga;
- um formulário pra **registrar visita** (de hoje ou de um dia passado, com o que foi falado), **só anotar**, e a lixeirinha
  pra **apagar** uma visita registrada por engano.

Como funciona por baixo: tabela `visitas_da_loja` (um dia por loja, com `nota` e quem visitou). A "última visita" que a tabela
e os avisos usam (`clients.ultimaVisitaEm`, "há 12 dias") é **sempre o dia mais recente** desse histórico; apagar a última visita
faz a anterior voltar a ser a última. As visitas que já estavam marcadas viraram a primeira linha do histórico (o que veio antes
não foi guardado). O "Visitei hoje", o lápis da data (corrige a ÚLTIMA visita, levando a nota junto) e o
`visitei a Vilela, conversei com o dono…` do WhatsApp gravam todos no mesmo lugar. Mesma regra de acesso de sempre: só nas lojas da
carteira de quem usa.
