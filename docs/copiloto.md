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

**Ficha sem o 55 (corrigido):** a Z-API só acha o número com o 55 na frente, e o WhatsApp guarda uns com o nono dígito e outros
sem. Quem tinha o número digitado "(42) 9…" caía no recado de desconhecido quando o WhatsApp escondia o telefone (`@lid`). Agora
o robô tenta as formas possíveis (`formasDoNumero`: com 55, com/sem o 9) antes de desistir. Se ainda assim não reconhecer, o
`privado-desconhecido` na trilha diz se foi lid ou telefone.

**A tela pra descobrir (Configurações → WhatsApp → "Quem o robô reconhece no privado", só ADMIN):** botão "Conferir agora"
mostra (1) cada pessoa com WhatsApp na ficha — ativa?, fim do número, se a Z-API o conhece, e se há **dois cadastros com o mesmo
número** (o robô não escolhe e não reconhece nenhum); (2) as últimas mensagens privadas que chegaram e **de quem o robô achou
que eram**; (3) a trilha do que ele fez. Só o fim dos números; nunca texto de mensagem. É a primeira coisa a olhar quando
alguém da casa recebe "este número é um atendimento interno".

**O nono dígito no meio (corrigido, era a causa da Andrielli):** a Z-API manda o celular sem o 9 (`554284279897`) e a ficha tem
com ele (`5542984279897`). A comparação era só por sufixo, e o 9 fica NO MEIO, então não batia. `mesmoNumero` (em `mencao.ts`)
agora também compara DDD + os 8 últimos dígitos (`chaveDoCelular`), que não muda com 55 nem com o 9. Vale pro privado, pra
marcação no grupo e pro quadro de diagnóstico.

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
`o que está no ar?`, `lista dos carros ativos`. O robô responde com a lista no estilo da casa: `Carros patrocinados.` e os carros numerados, só nome e ano (sem leads nem rodapé). **Só lê** (não pausa nem
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


### No privado do robô (`src/lib/whatsapp/anuncios-ativos-no-privado.ts`)

O mesmo pedido vale no privado ("carros ativos", "listar os anúncios", "lista dos carros ativos da Lourenço"): mesma lista, **só os que
estão no ar, sem gasto**, e **só quando a pessoa pede**. Antes isso caía na IA, que misturava anúncio desligado e mandava os valores.
A loja vem da frase, ou da conversa de agora há pouco, ou da única loja da pessoa; sem nenhuma das três o robô **pergunta de qual
loja** (nunca chuta). A carteira vale: a gestora só vê as lojas dela. Quem pergunta de **gasto, pausado, estoque, leads ou
resultado** não recebe esta lista (segue pro fluxo de sempre), e pedir a lista descarta uma pausa que esperava "sim".

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

## Registrar o dia a dia pelo WhatsApp (`src/lib/whatsapp/comandos-do-dia.ts`)

No privado do robô, frase **afirmativa e no passado** (sem "?") vira registro no sistema. O robô responde repetindo
**exatamente o que gravou** — é assim que um engano aparece na hora. Tudo é desfazível na tela da loja.

| Você manda | O que o robô faz | Quem pode |
|---|---|---|
| `visitei a Vilela` (`ontem`, `na terça`) | Marca a **última visita** (a data certa). Se vier "…, conversei com o dono sobre o estoque", guarda isso no **histórico** da loja, com o seu nome | gestora (lojas dela), gerência e dono (todas) |
| `anota na Vilela: o dono quer trocar o carro` | Grava a nota no **histórico** da loja (`ClientHistory`) | idem |
| `gravei na Vilela, 3 carros` | Lança a **gravação** (3 carros, entrega no dia seguinte). Mesma gravação duas vezes não duplica; sem quantidade ele pergunta | Igor / gerência / dono |
| `entreguei os vídeos da Vilela` | **Dá baixa** na gravação pendente mais antiga da loja (e diz se ainda há outras) | Igor / gerência / dono |
| `mandei o relatório da Vilela` | Marca **"Enviei"** na semana (o mesmo botão da tela) | gestora (lojas dela), gerência, dono |
| `acessos do cliente Pereira completos`, `contrato assinado da Pereira`, `campanha no ar da Pereira` | Marca a(s) **etapa(s) de implantação** da ficha aberta. "Acessos completos" marca Meta + Instagram. "Campanha no ar" encerra a implantação | gerência / dono |
| `reunião com a Garagem Y dia 25 às 15h` | **Pede confirmação** e, no "sim": leva o lead pra *Reunião agendada* (ou cria o lead) e põe na **Agenda** (1h, horário de Brasília) | **só o dono** |
| `fechei a Garagem Y, R$ 1.800 por mês` | **Pede confirmação** e, no "sim": lead em *Fechado* com o valor, entra no painel de vendas/metas e avisa a Meta | **só o dono** |

Travas:
- **Pergunta não registra** ("quando visitei a Vilela?"), nem negativa ("não mandei o relatório").
- **A loja vem da carteira de quem escreve** (mesma régua da tela). Loja que não é achada, ou citada em dupla, nunca é
  adivinhada: o robô pergunta. Gestora não registra em loja de outra.
- Sem acesso ao módulo (gravação, implantação, Comercial) o robô diz de quem é aquilo e **não registra nada**.
- Comercial: lead que não existe **só é criado depois do "sim"**, e o robô avisa na confirmação que vai criar. O nome do
  lead só casa por nome igual ou contido ("Pereira" ↔ "Pereira Motors"), nunca por uma palavra solta ("garagem").
- A anotação da visita usa as **palavras da própria pessoa** (não é resumida por IA: resumo errado no histórico é pior
  que nota crua).
- A regra do funil (marcos, evento de venda) mora em `src/lib/comercial/funil.ts` e a das etapas em
  `src/lib/etapas-gravar.ts`, usadas pela tela e pelo WhatsApp — uma regra só.

### Áudio no privado (`src/lib/whatsapp/atender-audio-privado.ts`)

Qualquer comando acima (e qualquer pergunta) vale por **áudio**: o robô transcreve, responde `🎙️ Ouvi: "…"` e trata como
se tivesse sido digitado. Número de fora, ou sem acesso a clientes, é ignorado **sem baixar o áudio**. Até 2 minutos.
Precisa de `OPENAI_API_KEY` (a mesma do áudio do financeiro).

## Tarefas (únicas e recorrentes) — WhatsApp, Meu Dia e o robô das 8h30 e 17h

Lista de tarefas de cada pessoa da casa (tabelas `tarefas`, `tarefas_feitas`; **não** é a `tasks` das Operações, que é
presa a um cliente). Código: `src/lib/tarefas/` (regras, dados, robô) e `src/lib/whatsapp/tarefas-no-privado.ts`.

**Pelo WhatsApp (privado do robô):**

| Você manda | O que acontece |
|---|---|
| `me lembra de ligar pra Vilela sexta` | Cria a tarefa pra você, na hora (prazo "sexta" = 13/11, por exemplo) |
| `toda segunda me lembra de conferir a verba` / `todo dia …` / `todo dia 5 …` | Tarefa que **repete** (diária seg–sáb, semanal, mensal; dia 31 em mês curto cai no último dia) |
| `o que tenho hoje?` / `minhas tarefas` | A lista de hoje, **numerada** (atrasadas primeiro) |
| `feito 2` / `feito 1 e 3` / `feito tudo` / `feito: ligar pra Vilela` | Dá baixa. Quem **atribuiu** a tarefa é avisado ("Tatiana concluiu…") |
| `cancela a tarefa 2` | Tira da lista (a que repete, **para**: não volta mais) |
| `pede pra Tatiana conferir a verba até sexta` / `toda segunda a Tatiana confere o relatório` | **Só dono e gerência.** O robô mostra a tarefa e pergunta; no "sim" cria e **avisa a pessoa pelo WhatsApp** |
| `tarefas da Tatiana` | **Só dono e gerência:** a lista de hoje dela |

Regras: tarefa pra si não pede "sim"; tarefa pra **outra pessoa** pede (manda WhatsApp pra ela). Gestora não passa tarefa
pra outra (o robô explica e oferece criar pra ela mesma). O número do "feito 2" é o da lista **de hoje**, a mesma que o robô
manda de manhã e às 17h; a tarefa concluída fica riscada na lista, então os números não pulam no meio do dia.
Perguntas que não são exatamente estes formatos (`tarefas atrasadas das lojas?`) seguem pro Copiloto.

**O robô** (`/api/tarefas/rodar?hora=manha|tarde`, no `vercel.json`: 11:30 UTC = **8h30** e 20:00 UTC = **17h**, seg–sáb):
- 8h30: cada pessoa com algo aberto hoje recebe a lista. Nada pra fazer = nenhuma mensagem. (Os gestores de tráfego também
  recebem o resumo da carteira na mesma mensagem — ver "Resumo da manhã".)
- 17h: quem ainda tem tarefa aberta recebe "como estão as tarefas de hoje?" com a lista e o "feito 2". O que não for feito
  fica na lista do dia seguinte. **Atrasadas** (prazo que passou) aparecem com ⚠️ pra pessoa, e o **dono e a Andrielli**
  recebem uma mensagem só com o quadro das atrasadas da equipe.
- Cada aviso sai **uma vez** por pessoa/dia/tipo (`avisos_de_tarefa_enviados`); falha de envio libera a próxima passada.
  Domingo e fora da janela (manhã 7–12h, tarde 15–20h) não manda nada.

**No Meu Dia** há o bloco "Tarefas de hoje": marcar como feita (e desfazer), cancelar/parar, e um formulário (título, data,
repete, e — só pro dono e a gerência — "pra quem"). Atribuir pela tela também avisa a pessoa por WhatsApp.

## Resumo da manhã (gestora) e aviso das gravações (Igor)

Na mesma mensagem das **8h30** (ver "Tarefas"; `src/lib/tarefas/resumo-da-manha.ts`), tudo **determinístico** — os mesmos
números do Meu Dia, escritos em frase, sem IA no meio:

- **Gestora (quem tem carteira):** quantas lojas conferir hoje; **verba** (Pix cobrado e não veio, sem saldo/acabando,
  esperando a verba cair, gastando acima do combinado, verba sobrando — ou "nenhum alerta ✅"); **relatórios da semana**
  (segunda: "hoje é dia"; terça em diante: quais ainda faltam); e as **tarefas do dia** logo acima. "Artes cansadas" só
  entra se o aviso de arte cansada estiver ligado no sistema (`AVISOS_DE_CANSACO_LIGADOS`, hoje desligado).
- **Igor** (e-mail `igor…@legacydigital.com`, `ehIgor` em `permissions.ts`): **gravações de hoje** e **entregas pra mandar**
  (pra hoje e atrasadas). Sem nada, não manda mensagem.
- Quando o Igor manda **`enviei os vídeos da Vilela`** (ou `entreguei…`, `mandei os vídeos…`), o robô dá baixa na entrega mais
  antiga da loja e **avisa o gestor de tráfego da loja**: "🎬 Vídeo novo — Vilela…". O Igor vê quem foi avisado (ou por que
  não: loja sem gestor, gestor sem WhatsApp, envio recusado). O mesmo aviso sai quando a entrega é marcada **no botão da tela
  de Gravações** (uma regra só, `src/lib/gravacoes-aviso.ts`). Desmarcar a entrega não avisa ninguém; repetir não avisa de novo.

## O erro "A IA respondeu fora do formato esperado"

Causa: o modelo **pensa** antes de responder e o pensamento conta dentro do teto de tokens (`max_tokens`). Chamadas com
teto baixo (1.000, 1.500, 3.000, 4.000) tinham a resposta cortada no meio e o robô desistia. Os adaptadores
(`src/lib/ai/provedores/`) agora nunca mandam teto abaixo do padrão do sistema (`AI_MAX_TOKENS`, 8.000): o teto é só
um limite, não custa nada quando não é usado.

## Onboarding: aviso de formulário respondido e prazo de 7 dias (`src/lib/onboarding/avisos.ts`)

- **Chegou formulário** (o formulário público do cliente novo): na hora, o **dono (ADMIN)** e a **Andrielli** recebem no WhatsApp
  "📝 Formulário respondido!" com a loja, o contato, o telefone e o **prazo de 7 dias** (a data limite). O aviso nunca atrapalha o
  envio do formulário (se o WhatsApp falhar, o cliente continua vendo "recebemos").
- **O onboarding tem no máximo 7 dias**, contados do dia em que o formulário chegou (dia 1 = chegada, dia 7 = último dia). Todo dia
  às 8h30 (junto da rotina das tarefas, seg–sáb) o robô avisa os dois **enquanto o onboarding estiver aberto e nada estiver andando**
  (nenhuma etapa de implantação marcada nas últimas 24h): "Dia 4 de 7 · 0 de 11 etapas · nada marcado há 3 dias · faltam 3 dias".
  Depois que o prazo estoura o aviso é **"ATRASADO"** e sai todo dia **mesmo com coisa andando**.
- Onboarding **concluído** (campanha no ar, ou concluído à mão) não avisa mais. Onboarding com etapa marcada nas últimas 24h e dentro
  do prazo fica quieto. Cada aviso sai uma vez por pessoa/dia/ficha.
- Quem recebe: usuário ADMIN e a Andrielli (e-mail `andriel…@legacydigital.com`) com **WhatsApp cadastrado**.


## Gasto e leads NUNCA saem no grupo do cliente (trava em código)

No grupo de uma **loja**, quando a mensagem marca o robô e não é pedido de pausar nem de lista, a IA responde recortada naquela loja
(`responderSobreALoja`, em `atender-grupo.ts`). Ela mandou a lista de carros "dos últimos 7 dias" com **leads e gastos** no grupo
da Área 42. Agora a regra é de código, nos dois lados (`falaDeGastoOuResultado`):

- **Pergunta** com gasto/investimento/verba/saldo/custo/leads/resultado/alcance/R$…: a IA **nem é chamada**.
- **Resposta** da IA com R$, gasto, leads etc.: **não sai** no grupo.
- Nos dois casos o robô fica **calado no grupo** e o **gestor da loja recebe um aviso no privado** com a pergunta ("não respondi:
  gasto e leads não saem no grupo do cliente"). Na trilha aparece `gasto-ou-leads-nao-vai-pro-grupo`.
- Resposta sem dinheiro (ex.: "o que você faz?") segue saindo normalmente.
- Os **parabéns de venda** (`textoDeParabens`) ainda mostram "Valor investido" e "Leads" do carro: foi decisão anterior, pendente de
  confirmação se continua.
