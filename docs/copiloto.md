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
| `gasto_do_carro` | "quanto gastou no Mobi 2018" — sempre o total do tempo máximo |

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


## No privado do WhatsApp

O mesmo Copiloto da tela, pelo WhatsApp. A pessoa é achada pelo número, e o
número diz quais lojas ela pode ver — pela mesma função da tela, então ninguém
descobre por aqui a loja de outro gestor, nem perguntando de propósito.

Número que não é de ninguém da casa recebe um recado curto e **não** aciona a
IA: é o que impede qualquer pessoa com o número do robô de gastar a nossa chave.

### Pausar anúncio, com confirmação

Pedido do Guilherme: *"só deve executar se for pedido a execução, e com
confirmação."* Duas coisas, e as duas valem.

**1. Só ORDEM executa.** A IA recomendando ("esse anúncio gasta sem resultado")
não é ordem. Só vira ação quando a pessoa manda: *"pausa o Virtus da R2"*. E
quem decide isso é uma regra escrita (`pedidoDeExecucao`), não o modelo: um
modelo que decide se a frase foi uma ordem erra de um jeito diferente a cada
vez, e aqui o erro custa um anúncio fora do ar.

Os verbos são mais estreitos que os do grupo, de propósito. No grupo, "vendeu o
Virtus" vale como pedido, porque a pessoa já marcou o robô com @ e a loja inteira
lê. No privado o robô conversa, e "o Virtus da R2 vendeu" pode ser só uma
informação. Ali o robô diz que dá pra pausar e ensina a pedir.

**2. Confirmação.** O robô diz exatamente o que vai pausar:

```
Vou pausar na *R2*:
• VOLKSWAGEN VIRTUS 1.6 MSI AUTOMÁTICO 2021

Responde *sim* pra eu pausar (vale 10 minutos) ou *não* pra cancelar.
```

e só pausa com um "sim" **da mesma pessoa, na mensagem seguinte**, em até 10
minutos. Guardado em `conversas_do_copiloto.acaoPendente`.

### Por que a confirmação é tão estreita

Valer só pra PRÓXIMA mensagem é de propósito. Uma confirmação que sobrevive a
outras conversas é uma bomba-relógio: um "sim" dito meia hora depois, sobre outra
coisa ("sim, a Mega também está sem verba"), pausaria um anúncio que a pessoa já
tinha esquecido de ter pedido. **Qualquer outra mensagem cancela.**

Por isso também só vale mensagem curta e inteira: "sim mas tira só o 2020" não é
um "sim", é um pedido novo.

### O que protege de errar de loja

O pior erro possível aqui é pausar o anúncio de OUTRO cliente. Cada trava abaixo
existe por um caso concreto, e todas estão testadas:

| Situação | O que o robô faz |
| --- | --- |
| Carro existe em duas lojas dela e ela não disse qual | Pergunta qual loja |
| Cita duas lojas na mesma frase | Recusa e pede **um pedido por loja** — fazer metade em silêncio é pior que recusar |
| Escreve "da Point" e a Point é de outra gestora | Diz que não achou "point" entre as lojas dela. **Não** procura o carro nas outras lojas dela |
| Loja mudou de gestor entre o pedido e o "sim" | Reconfere a carteira na hora do "sim" e não pausa |
| Dois "sim" ao mesmo tempo (dedo duplo, reenvio da Z-API) | Só um executa; o outro descobre que já foi tratado |
| O mesmo carro anunciado duas vezes (o Ka e o Ka "Cópia") | Lista e pausa os DOIS |
| Uma palavra certa e outra torta ("compass e virtual") | Confirma só o que é certo, diz o que ficou de fora, e avisa que o "sim" cobre só a lista |

A linha do meio foi achada pelo teste, não por revisão: o robô ignorava a palavra
"point", achava um Onix na loja dela e propunha pausar **esse**. Ela diria "sim"
achando que era o da Point.

### O que não mudou de mão

Quem executa é `mudarStatus`, a MESMA função da tela e do grupo, com o mesmo
registro em `meta_acoes` — agora com o nome de quem pediu ("Giovana (privado)") e
a frase que escreveu. O Copiloto não ganhou caminho próprio pra Meta.

**Verba não muda por aqui.** Só pausar anúncio. Mudar orçamento pelo WhatsApp é
digitar um valor num celular, e valor errado gasta dinheiro de verdade; na tela
dá pra conferir antes.

### Número oculto (`@lid`)

O WhatsApp está trocando o telefone por um identificador privado (`@lid`, 14
dígitos) em parte das conversas, e a Z-API só repassa. Quem escreve assim chega
com um número que não bate com nenhum telefone cadastrado — e sem tratamento
seria "desconhecido": uma gestora da casa recebendo "este número é um
atendimento interno", ou nada.

A Z-API não converte lid em telefone, mas converte telefone em lid. Então o robô
pergunta o lid de cada número cadastrado (com cache) e compara por **igualdade
exata**, não por sufixo. A resposta volta pro próprio `@lid`, que a Z-API aceita
como destino. Testado: a gestora é reconhecida, o lid de outra pessoa não herda a
carteira dela, e lid que só termina igual não casa.

### A trilha também vale pro privado

Toda mensagem privada deixa uma linha em `passo_do_robo` (`privado-chegou` →
`privado-respondeu`, ou `privado-desconhecido`, `privado-envio-recusado`…). O
`responder` do privado tinha o mesmo defeito que deixou o robô do grupo mudo por
dois dias: ignorava o retorno do envio, e a Z-API recusando virava silêncio sem
rastro. Só o fim do número é guardado (`lid…2873`), nunca ele inteiro.

### Os avisos

O robô dos alertas manda cliente sem verba e relatório não enviado no WhatsApp do
gestor — ver `docs/alertas.md`.

### O que foi conferido, e o que não foi

Contra Z-API e Meta falsas, banco de teste, duas gestoras com carteiras
diferentes: o pedido espera o "sim"; o "sim" pausa uma vez só; "não" cancela;
outra conversa no meio cancela; "sim" depois de 10 minutos não pausa; o carro com
dois anúncios cai junto; só a carteira dela; duas lojas na frase recusa; carro em
duas lojas pergunta qual; loja que mudou de gestor não pausa; dois "sim"
simultâneos geram uma chamada na Meta; e recomendação da IA ou "vendeu o X" não
viram execução.

**Não foi conferido:** uma pausa real na Meta a partir do privado, e a entrega num
WhatsApp de verdade. Isso só a produção responde, depois de os números dos
gestores estarem cadastrados em Configurações.


## Quanto um carro gastou: sempre o total do tempo máximo

Pedido do Guilherme: quando o gestor perguntar o gasto de um carro, no grupo ou no
privado, a resposta é o **gasto total do tempo máximo**.

É uma consulta própria (`gasto_do_carro`) e não "itens da loja com período tudo",
porque o período não pode ser escolha do modelo — ele escolhe diferente a cada
vez, e o padrão quando não escolhia era os últimos 7 dias. Aqui o período não é
parâmetro: mesmo que ele mande `periodo=7`, o resultado é o total de sempre
(testado).

```
*FIAT MOBI 2018 BRANCO* — R$ 800,00 desde 01/03/2025 · 15 leads
```

**Soma os anúncios do mesmo carro.** A loja anuncia o mesmo carro mais de uma vez
(o "Ka" e o "Ka — Cópia" da R2), e o gasto do carro é a soma deles. Mostrar só o
primeiro daria um número menor que o verdadeiro com cara de resposta completa. É
a mesma regra que faz o robô pausar os dois juntos, e a mesma busca de carro que
o grupo usa pra desligar — "Virtus" quer dizer a mesma coisa nas duas.

**Entra** anúncio pausado e de carro já vendido: o gasto aconteceu.
**Não entra** anúncio apagado na Meta — ela devolve "o máximo do que ainda existe
na conta". A ressalva vai dentro dos dados.

**Dois carros parecidos** ("virtus" numa loja com o 2021 e o Highline 2020):
mostra os dois, cada um com o seu total, e a soma vem do sistema. Numa pergunta de
gasto, escolher um sozinho é dar o número de outro carro. Com o ano ("virtus
2021") é um só.

**Palavra torta** ("virtual"): responde "a palavra não existe — quis dizer
virtus?", em vez de "não achei".

**A carteira vale igual.** No privado, só as lojas dela, e uma pergunta sem dizer a
loja devolve uma linha por loja (R2, Mega…). No grupo do cliente, a loja é a do
grupo e **não a que o modelo escreveu**: mesmo que ele ponha o nome de outra loja,
inclusive de outra gestora, o resultado é só o do grupo.

A fonte é `meta_lifetime`, o acumulado por anúncio que a varredura renova a cada
15 minutos.

**Não foi conferido:** que o total bate com o "máximo" que a Meta mostra no
Gerenciador para um carro de verdade. Os testes provam a soma e o recorte; a
conferência de número contra a Meta só a produção responde.

## "Quais anúncios ativos?" no grupo da loja (`src/lib/whatsapp/anuncios-ativos.ts`)

No grupo da loja, marcando o robô: `quais anúncios ativos?`, `carros ativos`, `quais carros estão rodando?`,
`o que está no ar?`, `lista dos carros ativos`. O robô responde com a lista organizada. **Só lê** (não pausa nem
muda nada), por isso responde também na loja que não autorizou o robô a desligar anúncio.

- **O que entra:** anúncios no ar de verdade (`effectiveStatus` ACTIVE: anúncio, conjunto e campanha ligados), de
  **todos** os conjuntos e campanhas da loja. Pausado, em análise e recusado ficam de fora.
- **Organização:** um carro por linha, em ordem alfabética. Anúncios do mesmo carro ("C3 foto" e "C3 foto vídeo — Cópia")
  viram uma linha só, com os leads somados.
- **Em cada carro:** quantos anúncios no ar (e os formatos) e quantos leads. **Sem gasto e sem custo por lead**, a pedido
  do Guilherme (o gasto já vai em outras mensagens do robô). Carro sem número da Meta diz isso, em vez de "0 leads".
- **Rodapé:** total de leads e quando a Meta foi lida. Os leads são o acumulado do carro (o mesmo número que o robô
  grava ao registrar uma venda), não o de hoje, e não é em tempo real.
- **Muitos carros:** divide em várias mensagens (até ~3.000 caracteres cada), sem cortar um carro no meio, com a
  numeração contínua e o total na última.
- Frase que manda mexer ("pausa os anúncios ativos do gol", "vendeu o virtus") **não** vira lista: segue o fluxo de sempre.

## Avisar a equipe pelo robô (`src/lib/whatsapp/aviso-para-equipe.ts`)

No privado do robô, **só o dono (ADMIN)**: `envie um aviso à Tatiana e à Giovana: a reunião mudou pra 15h`,
`avisa a Andrielli que o relatório saiu`, `manda um recado pra equipe: …`, `envie um aviso às três, como um teste`.

- O robô responde com o **texto exato** e **quem vai receber**, e só manda depois de um "sim" (também vale "pode",
  "manda", "envie no número delas"). A confirmação vale 10 minutos e uma vez; outra mensagem no meio descarta o pedido.
- Só gente da casa: usuário ativo, com WhatsApp cadastrado. Nunca um número digitado na conversa, nunca cliente.
- O texto é o que o dono escreveu (entre aspas, depois de ":" ou de "que…"). Sem texto, ele pergunta qual é o recado;
  só a palavra "teste" liga o aviso-padrão de teste. O robô não inventa recado.
- Primeiro nome que bate com duas pessoas: pergunta qual (pede o nome completo). "A equipe" = gestoras e gerência.
- O recado sai como `*Recado do <nome de quem mandou>:*`. Quem não tem WhatsApp cadastrado é dito na confirmação e no
  resultado ("não mandei pra X"). Falha de envio de um não impede os outros, e o resultado diz quem recebeu e quem não.
- Antes disto o Copiloto respondia "Aviso de teste para…" como se tivesse mandado. Agora o prompt dele proíbe fingir
  envio.

## O erro "A IA respondeu fora do formato esperado"

Causa: o modelo **pensa** antes de responder e o pensamento conta dentro do teto de tokens (`max_tokens`). Chamadas com
teto baixo (1.000, 1.500, 3.000, 4.000) tinham a resposta cortada no meio e o robô desistia. Os adaptadores
(`src/lib/ai/provedores/`) agora nunca mandam teto abaixo do padrão do sistema (`AI_MAX_TOKENS`, 8.000): o teto é só
um limite, não custa nada quando não é usado.
