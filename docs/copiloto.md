# Copiloto

Perguntar em português sobre as contas, e receber resposta com os números de
verdade. Fase 3 do sistema, pedida pelo Guilherme em 16/11/2026.

## A decisão que define tudo: o modelo não vê o banco

A regra número um é não inventar número. Um modelo com acesso ao banco
escreve a consulta errada e responde com convicção sobre dados que não
existem — e quem lê não tem como saber.

Então são **duas chamadas ao modelo**, nunca uma:

1. **Escolher.** "O que o gestor quer saber?" O modelo escolhe UMA consulta
   de uma lista fechada e diz com quais parâmetros. Ele não viu dado nenhum
   ainda, então não há o que inventar.
2. **Escrever.** O sistema roda a consulta de verdade e devolve ao modelo os
   números que vieram do banco. Só então ele escreve a resposta.

Custa duas chamadas em vez de uma. É barato perto de uma decisão tomada em
cima de número errado.

Por isso também não foi usada chamada de ferramenta: a camada de IA que já
existia (`src/lib/ai/`) é "pergunta → JSON tipado", e ela serve perfeitamente
a este desenho. Nada foi reescrito.

## As consultas são uma lista fechada

Em `src/lib/copiloto/consultas.ts`. O modelo só pode pedir estas:

| Consulta | Responde |
|---|---|
| `desempenho_das_lojas` | "quais clientes estão pior", comparação entre lojas |
| `desempenho_de_uma_loja` | "como está a loja X", com saldo e ritmo |
| `itens_da_loja` | "qual campanha gasta mais", campanhas/conjuntos/anúncios |
| `desperdicio` | "onde estou perdendo dinheiro", gastou e não trouxe nada |
| `comparar_periodos` | "caiu?", "melhorou?", com a variação calculada |
| `saldo_das_lojas` | "quem vai ficar sem verba" |
| `acoes_recentes` | "o que mudou", "quem pausou isso" |

Duas coisas que o sistema calcula e NÃO deixa pro modelo:

- **A ordenação do "pior".** Quem gastou e não trouxe nada vem primeiro;
  depois, do custo por resultado mais caro pro mais barato; loja parada vai
  pro fim, porque não gastar não é ir mal.
- **A variação entre períodos.** Pedir pro modelo dividir dois números é
  pedir pra ele errar uma conta que o sistema já sabe fazer.

## A trava de carteira é por consulta

Toda consulta recebe o usuário e filtra por `escopoDaCarteira`. Não existe
consulta que receba um clientId e confie nele.

**Conferido no navegador:** logada como gestora de uma loja só, ela vê só a
dela em `desempenho_das_lojas`; e ao perguntar pela loja de outro gestor,
recebe "Não achei X na sua carteira" em vez dos números. Pelos quatro
caminhos — desempenho, itens, desperdício e ações.

## Ação: ele propõe, gente executa

O Copiloto **não executa nada**. Quando recomenda pausar um anúncio ou mexer
na verba, devolve uma proposta que vira um cartão com botão.

Três camadas antes de qualquer coisa chegar na Meta:

1. **O servidor resolve o nome da loja contra a carteira.** O que chega na
   tela não é o nome que o modelo escreveu: é uma loja que existe e é de quem
   perguntou. Proposta sobre loja de outro é descartada e nem vira botão.
2. **Dois cliques.** O primeiro pede, o segundo confirma com a frase que o
   servidor devolveu — o nome exato e o valor de antes e depois.
3. **Quem executa é a MESMA função da tela do Meta Ads** — `acaoEmLoteNaMeta`
   e `definirVerba`. O Copiloto não ganhou caminho próprio pra mexer na Meta:
   ele aponta pro caminho que já existia e já é auditado, com registro em
   `meta_acoes`.

**Conferido:** o modelo propôs pausar dois anúncios, um de uma loja que não
era da gestora. Só um virou botão.

Por que dois cliques e não um: o modelo sugere em cima de números certos, mas
a leitura que ele faz deles é opinião. "Gastou R$ 300 sem resultado" pode ser
criativo ruim ou campanha ligada ontem que ainda não aprendeu. Quem sabe é o
gestor.

## O que falta

**A chave da IA.** Sem ela a tela diz qual variável falta e qual provedor
está configurado, e nada mais funciona — igual à tela do WhatsApp. Hoje
`AI_PROVIDER` decide entre `anthropic` (`ANTHROPIC_API_KEY`) e `openai`
(`OPENAI_API_KEY`).

**A conversa some ao recarregar.** De propósito, por ora: guardar conversa é
tabela, migração, tela de histórico e a decisão de quem pode ler a conversa
de quem. O fio DENTRO da sessão funciona — "e a semana passada?" depois de
"como foi a loja X" — porque o histórico vai junto a cada pergunta. O lugar
de mexer é `conversa.tsx`.

**Mudar verba aponta pro conjunto.** `definirVerba` espera um conjunto, que é
onde a Meta guarda orçamento. Se o modelo propuser verba citando um anúncio,
a ação vai falhar com o recado da própria função. Não foi "consertado" com
adivinhação de propósito: é melhor falhar visível que mexer no objeto errado.

## Como isso foi conferido

18 testes das consultas contra o banco de teste, incluindo o isolamento entre
dois gestores. O ciclo das duas chamadas contra uma OpenAI falsa, conferindo
no log que os números REAIS chegaram ao modelo. E a tela no navegador: o
estado sem chave, a conversa, a fonte do número embaixo da resposta, e o
descarte da ação sobre loja de outro.

O que NÃO foi conferido: a qualidade da resposta de um modelo de verdade.
Sem chave, não há como. O que está provado é que ele só recebe dado real e
que nada que ele sugerir escapa das travas.

## A bolha flutuante

O Copiloto também existe como uma bolha com rosto, em qualquer tela do
sistema. A página inteira continua lá, pra conversa longa; a bolha é pro
"pera, deixa eu checar uma coisa".

**Por que:** a pergunta nasce olhando outra coisa. "Por que essa loja está
vermelha?" acontece na tela do Meta Ads; "quem vai ficar sem verba?" acontece
no Meu Dia. Exigir sair da tela pra perguntar é exigir perder o contexto que
gerou a pergunta — e aí ninguém pergunta.

**Por que ela se move:** qualquer canto fixo tapa algo importante em alguma
tela. À direita cobre a coluna "lido"; à esquerda, o menu. Em vez de
adivinhar, ela se arrasta e lembra onde foi deixada, no navegador de quem usa
— é preferência de tela de uma pessoa, não dado da agência. Tudo em
try/catch: aba anônima recusa guardar, e isso não pode derrubar a tela.

**Detalhes que importam pouco e aparecem muito:** arrastar não abre a
conversa (só conta como clique quando o dedo quase não andou); ela se prende
dentro da tela quando o celular gira; o painel abre pro lado onde há espaço;
e ela some sozinha na página do Copiloto, onde seria o mesmo pela segunda
vez.

O rosto é SVG e não emoji por dois motivos: emoji muda de cara em cada
sistema, e assim ele acompanha o tema em vez de ser figura colada. Pisca de
vez em quando, e para de piscar enquanto está sendo arrastado ou com a
conversa aberta — aí ele está ocupado, e piscadinha vira distração.

**Conferido no navegador:** existe no Meta Ads, arrastou de (1320, 820) para
(271, 371), arrastar não abriu a conversa, lembrou a posição depois de
recarregar, o clique abriu, e na página do Copiloto ela não aparece.
