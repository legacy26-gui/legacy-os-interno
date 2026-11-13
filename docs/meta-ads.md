# Meta Ads

Saldo, campanhas e resultado das contas de anúncio, dentro do sistema.

Nasceu de uma pergunta do Guilherme — "mostrar o saldo pré-pago (Pix) da Meta
na tela do cliente" — e cresceu até cobrir o que a equipe antes olhava no
Gerenciador de Anúncios.

---

## Por que existe

Três perguntas que antes só o Gerenciador respondia, cada uma numa tela
diferente dele:

- **Tem dinheiro na conta?** Conta pré-paga zera e a campanha para sem avisar
  ninguém. No dia seguinte a loja não tem lead e ninguém sabe por quê.
- **Está dando resultado?** Gasto sem lead é dinheiro queimado devagar — pior
  que gasto alto, porque não assusta.
- **O que está ligado?** Campanha pausada há duas semanas não aparece em
  relatório nenhum.

No Gerenciador, essas três moram longe uma da outra, e por isso ninguém olha
as três. Aqui são a mesma linha.

---

## As telas

| Tela | O quê |
|---|---|
| `/meta-ads` | Todas as lojas, uma linha cada: saldo, investido, leads, custo por lead |
| `/meta-ads/[loja]` | Uma loja: campanhas → conjuntos → anúncios, como no Gerenciador |
| `/meta-ads/vincular` | Liga conta de anúncio a loja (direção) |
| `/meta-ads/relatorio` | A folha que vai pro cliente, e o PNG |
| Bloco na ficha do cliente | Saldo e o atalho pras campanhas |

**Cada um só vê o seu.** O recorte é o `escopoDaCarteira` do resto do sistema:
gestor de tráfego vê as lojas dele, direção vê a casa. Vale na lista, na tela
da loja, no relatório e na imagem — e loja de outro gestor dá **404**, não
"acesso negado", que confirmaria que ela existe.

---

## Como os números chegam

### O robô da noite faz o trabalho

O robô que roda todo dia às 11h (`/api/alertas/rodar`, ver `docs/alertas.md`)
passa em **todas** as contas da casa antes de calcular os alertas — nessa
ordem, senão os alertas olhariam os números de ontem.

Com isso a tela já está certa de manhã. Os botões são exceção, não rotina:

- **Atualizar tudo** (lista): varre a carteira de quem apertou, 4 contas em
  paralelo, com orçamento de 45 segundos.
- **Atualizar agora** (loja): só aquela loja, em segundos.

Os três caminhos chamam a mesma função (`lib/meta/varredura.ts`). Três
caminhos pro mesmo trabalho viram três comportamentos diferentes em seis
meses.

### O que é buscado, por conta

| Busca | O quê | Arquivo |
|---|---|---|
| Saldo | `funding_source_details` | `sincronizar-saldo.ts` |
| Números | `/insights` nível **anúncio**, dia a dia, 30 dias | `sincronizar-insights.ts` |
| Vida inteira | `/insights` com `date_preset=maximum` | `sincronizar-insights.ts` |
| Arte | `/ads` com `creative{thumbnail_url}` | `sincronizar-criativos.ts` |
| Cadastro | `/campaigns` e `/adsets`: status e orçamento | `sincronizar-estrutura.ts` |

**Só o saldo e os números entram no veredito da conta.** Arte e cadastro
falham em silêncio: não ter miniatura não pode pintar a loja de amarelo como
se o gasto estivesse desatualizado.

---

## As decisões que valem conhecer

### O grão é o anúncio

Guarda-se por **anúncio por dia**. Conjunto e campanha são somas disso.

É o que torna os três níveis possíveis sem três consultas que um dia
discordam: a soma dos conjuntos é a campanha porque é literalmente a mesma
linha somada de outro jeito. Total não se desfaz; grão fino se soma.

### O cadastro manda em quem aparece, os números só preenchem

Campanha que não gastou nada no período **não existe** nos insights. Antes
ela sumia da tela — e sumir é a pior forma de mostrar que algo está parado,
porque ninguém procura o que não vê. Justamente a campanha que alguém
precisa reparar que está pausada.

Hoje a lista vem de `meta_campaigns` / `meta_adsets` / `meta_ad_creatives`, e
os números entram por cima quando existem.

### Nunca inventar número

Três regras que vêm do mesmo lugar: **número que chega sozinho ninguém
confere depois**.

- **Saldo que não deu pra ler vira "indisponível", nunca R$ 0,00.** Zero faz
  alguém fazer um Pix que não precisava — ou achar que a conta que de fato
  zerou é o erro de sempre.
- **Custo por lead sem lead é `null`, não zero.** Gastar R$ 800 sem lead não é
  "custo zero": é não ter custo por lead. Zero apareceria como o melhor
  resultado da lista.
- **"Nunca buscado" também não é zero.** Antes da primeira leitura boa, o
  resumo mostra travessão. "Investido: R$ 0,00" diria que a casa não gastou
  nada, e gasto zero parece notícia boa.

"Buscado" quer dizer buscado **com sucesso**: tentativa que terminou em erro
não ensina nada sobre o gasto.

### "Saldo acabando" se mede em DIAS, não em reais

A primeira versão dizia "abaixo de R$ 50 é crítico, abaixo de R$ 150 é baixo".
Está errado, e foi o Guilherme quem apontou: **algumas lojas gastam R$ 300 no
mês e outras gastam R$ 3.000**. R$ 100 é uma semana pra primeira e meio dia
pra segunda. Com régua fixa, ou a lista vive vermelha pra quem gasta muito, ou
nunca avisa quem gasta pouco.

A régua é **dias de saldo** = saldo ÷ gasto médio por dia. Isso se calibra
sozinho, e é a pergunta que de fato se faz na frente da tela: *quando essa
conta para?*

De onde sai o gasto por dia, nesta ordem:

1. **O gasto real dos últimos 14 dias completos**, que o sistema já guarda. É
   melhor que qualquer número combinado porque acompanha a realidade: loja que
   acelerou na Black Friday passa a ser medida pelo ritmo da Black Friday.
2. **O investimento mensal combinado** (`Client.gastoMensalPrevistoCents`,
   definido na ficha da loja), ÷ 30. Entra quando a loja é nova ou ficou
   parada e não há de onde calcular.
3. **Nada.** Aí a tela mostra só o valor e não fala em dias — em vez de chutar.

Os cortes estão em `src/lib/meta/estado-da-loja.ts`:

| Tom | Quando | Como aparece |
|---|---|---|
| `sem-saldo` | menos de 1 dia, ou saldo < R$ 5 | cartão vermelho, etiqueta **SEM SALDO** |
| `acabando` | menos de 2 dias | cartão rosa, etiqueta **SALDO ACABANDO** |
| `atencao` | menos de 3 dias, erro de leitura, ou gastou sem lead | borda âmbar, etiqueta **OLHAR** |
| `bom` | o resto | faixa verde, sem etiqueta |
| `neutro` | sem conta, ou saldo que não deu pra ler | faixa cinza |

**Por que os cortes são tão apertados:** as lojas abastecem **por semana**. Sete
dias de saldo não é alerta, é o tanque cheio. A primeira versão avisava abaixo
de sete dias, e o Guilherme viu na hora o que ia dar: a lista ficaria amarela
quase a semana inteira, todo mundo se acostumaria com o amarelo e ele deixaria
de avisar qualquer coisa. O corte não é "pouco saldo", é **"não chega no
próximo abastecimento"** — num ciclo de sete dias, os dois últimos: um dia de
amarelo pra cobrar o Pix, um de vermelho se ele não veio. Se alguma loja passar
a abastecer por mês, estes números seguem valendo; ela só fica verde por muito
mais tempo.

Duas decisões que parecem detalhe e não são:

- **A média divide pelos dias QUE TÊM DADO, não por 14.** Conta vinculada
  anteontem tem dois dias de histórico; dividir por catorze faria o gasto
  parecer sete vezes menor e o saldo parecer durar sete vezes mais.
- **Erro de leitura é âmbar, não vermelho.** Vermelho quer dizer "a loja está
  em apuros"; erro quer dizer "o sistema não sabe". É problema nosso, não
  dela, e confundir os dois faz o vermelho perder o sentido. Pela mesma razão,
  conta de Pix sem leitura fica **cinza** e não verde: verde é a afirmação
  "olhei e está tudo bem".

### A lista se ordena por urgência, não por alfabeto

Esta regra já foi a contrária, e vale registrar por quê mudou.

O argumento do A-Z era bom: lista que se reordena sozinha embaralha a tela a
cada atualização, e aí ninguém acha a loja que veio procurar. O argumento está
certo; a conclusão é que estava errada. **Esta tela não é onde se procura uma
loja** — pra isso existe a ficha do cliente. É a tela de onde se trabalha a
fila do dia, e fila se ordena por urgência.

Então: vermelho, âmbar, cinza, verde; e dentro de cada cor a loja com **menos
dias de saldo** em cima. Loja sem conta vinculada vai pro fim, seja qual for o
resto — é linha sem número nenhum, e espalhada no meio ela corta a leitura das
colunas em pedaços.

Cinza (não deu pra ler o saldo) vem **antes** de verde: é pendência de alguém.
Verde é o lugar de quem não precisa de nada.

### "Link de verba enviado": o vermelho precisa saber o que já foi tratado

A lista acende vermelho na loja sem saldo, mas não sabia a diferença entre
**uma loja que ninguém olhou** e **uma que o gestor já cobrou às oito da
manhã**. As duas gritavam igual — e vermelho que grita por coisa já resolvida
é vermelho que, em duas semanas, ninguém olha mais.

Passar o mouse na faixa colorida (ou tocar nela, no celular) abre as ações da
loja. Marcar **"link de verba enviado"**:

1. A linha vira **azul**, etiqueta "Link enviado há 2 h", e desce pra baixo de
   quem ninguém tratou. Não vira verde: a conta continua zerada, isso é fato,
   não alarme. O que mudou é que **ela já tem dono**.
2. O sistema guarda o **saldo daquele momento** (`saldoNoEnvioCents`).
3. Na próxima leitura de saldo, se o número subiu mais de R$ 10, o pedido
   fecha sozinho e a loja volta ao normal — sem etiqueta nenhuma.
4. Se passarem **18 horas** e a verba não vier, a loja volta pra fila **na
   frente de todas**, com a etiqueta "Pix não entrou · cobrado há 19 h".
   Promessa não cumprida é mais urgente que alerta novo.

**Não existe "marcar como pago", de propósito.** Quem sabe se a verba entrou é
a Meta, não a memória de ninguém. Saldo de conta pré-paga só desce com gasto,
então qualquer subida depois do envio é dinheiro que chegou — e o gestor não
ganha uma segunda tarefa pra esquecer de fazer.

O `entrouEm` fica **gravado** em vez de recalculado a cada leitura: senão o
histórico mudaria de resposta assim que a loja gastasse o dinheiro que entrou.

Detalhes que custaram tentativa:

- **O painel abre, não alterna.** No celular o toque dispara `mouseenter`
  antes do `click`: o primeiro abria o painel e o segundo, encontrando-o
  aberto, fechava na mesma batida. No telefone ele simplesmente não abria.
- **A faixa tem 8px**, que é alvo bom pro olho e péssimo pro dedo. Um
  `::after` estica a área de toque 12px pra direita sem pintar nada, e para
  antes do respiro da coluna do nome pra não roubar o clique do link da loja.
- **O fecho roda no fim da varredura, não a cada conta.** O pedido é da LOJA e
  o saldo é da CONTA: perguntar antes de ler todas as contas dela daria falso
  negativo em loja com duas contas.

### Arte cansada: o problema que nenhum número de hoje mostra

Anúncio não morre de uma vez. Vai cansando: as mesmas pessoas veem a mesma
arte pela quinta vez, param de clicar, e o custo por lead sobe devagar — R$ 12,
R$ 14, R$ 17, R$ 23. Ninguém percebe de um dia pro outro. Percebe três semanas
depois, quando a loja reclama que não chega mais ninguém.

É óbvio olhando o gráfico e invisível olhando o número de hoje — por isso é
trabalho de sistema, não de gente.

A conta compara **os últimos 7 dias com os 7 anteriores**, do mesmo anúncio.
Duas janelas do mesmo tamanho pra que o resultado não dependa de a semana ter
sido boa ou ruim: o que se mede é a **mudança**.

| | |
|---|---|
| **Arte cansada** | custo por lead subiu 40%+, ou o CTR caiu 30%+ sem o custo melhorar |
| **Cansando** | subiu 20%+ |
| nada | está igual ou melhor |

Dois cuidados que seguram alarme falso:

- **Volume mínimo nas duas janelas** (500 impressões, 3 leads). Um anúncio que
  teve 1 lead e passou a ter 0 "dobrou de custo" na matemática e não quer
  dizer nada. Sem esse piso a tela viraria um varal de avisos inúteis.
- **CTR caindo COM o custo caindo não é arte gasta** — é campanha achando um
  público melhor. Só conta quando o custo não melhorou junto.

Anúncio novo não é diagnosticado: sem janela anterior não há comparação, e
dizer "firme" seria afirmar o que não se sabe.

A janela é sempre 7×7, **independente do período escolhido na tela**. "Essa
arte está cansando?" é a mesma pergunta em qualquer recorte, e deixá-la seguir
o seletor daria respostas diferentes pro mesmo anúncio conforme o botão que a
pessoa apertou por último.

### A loja está gastando o que combinou?

Gastar **demais** é problema óbvio: a verba acaba no dia 20 e a loja passa dez
dias sem anúncio, bem no fim do mês, que é quando ela mais vende.

Gastar **de menos** é problema silencioso, e por isso pior. A loja pagou pelo
mês inteiro, o dinheiro está parado e ninguém reclama — até o dia em que ela
olha o extrato, vê que investiu metade do combinado e pergunta pelo resto. Não
existe cobrança pior que essa.

A conta é a mais simples possível: o que gastou por dia até aqui, vezes os
dias do mês. Acima de **115%** do combinado é "acelerado", abaixo de **60%** é
"verba sobrando". Não tenta adivinhar fim de semana nem feriado — o que se
quer saber é se está MUITO fora, não calcular o centavo.

**Projeção e não "já passou do combinado"**: comparar o gasto do mês com o
total só acusa o problema no fim, quando não dá mais pra corrigir. No dia 10,
ter gasto um terço da verba não diz nada sozinho; diz tudo quando se percebe
que nesse ritmo vai dar o dobro.

Antes do **dia 5** o mês é novo demais e nada é projetado: um único dia parado
no dia 2 viraria "a loja está em 50% do combinado" e o aviso sairia errado
todo começo de mês.

### O Meu Dia fala do Meta

Tudo isso aparecia só pra quem ia procurar, numa tela que o gestor abria
quando lembrava — e "quando lembrava" é a parte que não funciona, porque conta
zerada para a campanha no mesmo dia e arte cansada estraga o mês em silêncio.

O bloco **"Nas contas de anúncio"** entra no topo do Meu Dia com: loja
precisando de Pix, loja cobrada cujo Pix não veio, loja esperando a verba
cair, verba fora do combinado (pros dois lados) e arte cansada.

A régua pra entrar ali é **só coisa que precisa de ação hoje**. "A loja está
bem" não é notícia: o número dela mora na tela do Meta Ads. Carteira sem
pendência nenhuma **não mostra bloco nenhum** — o silêncio é a informação, e é
o prêmio de estar em dia.

### Ajuste de conta se faz olhando a conta

A troca Pix/cartão nasceu só na ficha do cliente, e da tela do Meta Ads não
havia caminho até lá. Ou seja: o controle existia onde ninguém ia procurar, e
o Guilherme avisou que não conseguia trocar. Hoje ele está nos dois lugares —
na ficha e no botão **"Ajustes da conta"** da tela da loja, junto do "o que é
lead", que é o outro ajuste da mesma natureza.

Marcar uma conta como cartão **apaga os saldos guardados**, de propósito: no
cartão o número que a Meta devolve é limite de crédito, não dinheiro
disponível, e deixar a leitura antiga faria a tela mostrar como saldo um valor
que não é saldo.

### O que conta como lead é configuração DA CONTA

Uma loja roda WhatsApp, outra roda formulário. Somar as duas como se fossem a
mesma coisa daria um custo por lead que não quer dizer nada.

O padrão é conversa iniciada no WhatsApp/Direct. Quando a loja gasta e marca
zero lead, a tela avisa e diz qual tipo está configurado — pode ser campanha
sem resultado mesmo, ou o tipo errado. A direção troca no botão **"O que é
lead"**.

Trocar não reescreve o histórico: os dias já gravados ficam com a contagem
antiga até a próxima busca. A tela diz isso.

### Alcance é aproximado, e a tela avisa

Alcance conta **pessoas**; impressões contam **vezes**. A mesma pessoa em dois
conjuntos é alcançada uma vez, mas somando as linhas ela conta duas. A Meta só
sabe o número exato no nível que ela mesma calculou.

Somamos porque é a melhor aproximação disponível, e o rodapé da tela diz que é
aproximado em vez de prometer exatidão que não existe.

---

## O token

`META_ADS_READ_TOKEN`, nas variáveis da Vercel. **Só de leitura** (`ads_read`).

- Vai sempre no cabeçalho `Authorization`, **nunca na URL**. Query string entra
  em log de servidor, em histórico de proxy e no Referer do navegador.
- A paginação segue o cursor `after`, e **não** a URL `next` que a Meta
  devolve — aquela vem com o token dentro.
- Toda mensagem de erro passa por um filtro antes de chegar na tela.
- `src/lib/meta/cliente-graph.ts` é `server-only`: importar numa tela de
  navegador quebra o build em vez de mandar o token pro cliente.

A conta precisa estar **na BM** e o token precisar alcançá-la. A tela de
vincular pergunta à Meta quais contas ele enxerga — loja que não aparece lá
não é falha do sistema, é acesso que ainda não foi dado no Gerenciador de
Negócios.

---

## Vincular contas

`/meta-ads/vincular`, só direção.

Pergunta à Meta (`/me/adaccounts`) quais contas o token alcança e **sugere a
loja pelo nome**. A sugestão preenche; quem confirma é gente, uma por uma —
ela casa "Bravos Motors" com "Bravos Veículos" de boa vontade, e conta na loja
errada manda o gasto de uma pra ficha da outra.

Avisa também o que só se descobre tarde: conta em **moeda diferente de real**
(os valores não são em R$) e conta **desativada na Meta**.

Desvincular apaga os números junto: são cópia do que está lá, e guardar o
gasto de uma conta que não é mais desta loja seria pior que perder.

---

## O relatório do cliente

`/meta-ads/relatorio`. Escolhe gestor, loja e período; sai a folha e o **PNG**.

**PNG e não PDF**, decisão do Guilherme: "PDF nenhuma loja abre". O relatório
vai no WhatsApp do dono de uma loja de carro — PDF vira anexo que pede
aplicativo, imagem aparece na conversa.

**Quatro números, não catorze:** investido, leads, custo por lead,
visualizações. Quem lê é dono de loja, não gestor de tráfego. CTR e alcance
não ajudam ele a decidir nada; só fazem o que importa competir por atenção com
o que não importa. A tela interna continua mostrando tudo — são leitores
diferentes.

**Uma campanha por linha, sem conjunto e sem anúncio.** É mandado uma vez por
semana: ele quer saber se a semana foi boa, não qual público converteu melhor.

Detalhes que vieram de testar, não de desenhar:

- A **altura da imagem acompanha o conteúdo**. Com altura fixa, loja de duas
  campanhas saía com um terço de folha em branco — e no WhatsApp o pedaço
  vazio é o que aparece grande na prévia.
- A **capa é o anúncio que mais gastou E TEM ARTE**. Vídeo às vezes volta da
  Meta sem miniatura, e a capa ficava vazia tendo quatro artes na lista.
- O **nome do arquivo tem loja e data** (`loja-6-de-nov-a-12-de-nov.png`). Quem
  manda trinta por semana não acha nada numa pasta de `relatorio.png`.
- A folha escreve **datas de verdade**, não "7 dias": daqui a um mês, "7 dias"
  não quer dizer nada.

**Loja sem leitura boa não vira relatório** (HTTP 409). Um relatório com
R$ 0,00 em tudo porque a busca falhou é pior que relatório nenhum — esse vai
pro cliente.

Gerado com `ImageResponse` (`next/og`), que desenha JSX direto em PNG. Sem
navegador no servidor. O preço é que Satori só entende **flexbox** e um pedaço
do CSS: nada de grid, nada de Tailwind, tudo estilo embutido. Por isso o
desenho da imagem vive no route e não é compartilhado com a folha da tela —
são duas pinturas do mesmo quadro.

---

## Ligar e desligar pelo sistema

A chave da tela da loja liga e desliga de verdade — campanha, conjunto e
anúncio — desde que exista a variável `META_ADS_WRITE_TOKEN`. Sem ela a chave
continua só mostrando, e explica por quê.

### Dois tokens, de propósito

| | |
|---|---|
| `META_ADS_READ_TOKEN` | roda o tempo todo: robô da noite, cada botão de atualizar, dezenas de chamadas por dia |
| `META_ADS_WRITE_TOKEN` | só em `escrever-na-graph.ts`, só pra ligar/desligar |

Se o de leitura vazar, alguém vê números que não devia — ruim, e recuperável.
Se o de escrita vazar, alguém apaga a entrega de quarenta lojas numa tarde.
Por isso o caminho de leitura, que é o que roda em toda parte, **nunca chega
perto** do token perigoso.

Na escrita a regra do header vale em dobro: o corpo de um POST não aparece em
log de servidor, mas uma query string aparece em todo lugar — proxy,
histórico, relatório de erro.

### A trava que mais importa

O id do objeto vem do navegador. Se o sistema repassasse o que recebe,
bastaria trocar o número no pedido pra pausar a campanha de outro anunciante
da mesma BM — inclusive de cliente de outra agência.

Nada é mandado pra Meta antes de o objeto ser encontrado **no nosso cadastro,
dentro de uma conta vinculada àquela loja** (`acharObjetoDaLoja`). Quem não
está na nossa tabela não existe pra esse caminho, por mais real que seja na
Meta.

### Quem pode

O **gestor de tráfego pode**, nas lojas dele. É o trabalho dele: campanha
queimando verba sem resultado tem que parar na hora em que se percebe. Exigir
ADMIN garantiria só uma coisa — que todo mundo continuasse fazendo pelo
Gerenciador, onde não fica registro nenhum.

A trava não é de cargo, é de **carteira**.

### Pausar pede confirmação; ligar, não

Os dois erros não custam a mesma coisa. Ligar errado gasta alguns reais até
alguém perceber. **Desligar errado tira a loja do ar** — e campanha pausada
não avisa ninguém, não aparece em lugar nenhum, e só é descoberta quando o
dono liga perguntando por que parou de chegar gente.

A confirmação diz o estrago antes: *"Pausar a campanha para tudo que está
dentro dela — são 2 conjuntos ativos. A loja deixa de entregar."*

### Pausar é certo, ligar não é

Esta foi a parte que um teste pegou: pausei a campanha, recarreguei, e a chave
voltou ligada. O motivo é que a tela lê o `effectiveStatus` (o status de
verdade, já considerando o pai e o saldo) e só o `status` tinha mudado.

A regra certa não é simétrica:

- **PAUSAR é certo.** Nada "despausa" um objeto pausado: nem pai ativo, nem
  conta cheia. O efetivo também vira `PAUSED`, e desce pros filhos — igual a
  Meta faz. Só o efetivo deles, note: o conjunto continua `ACTIVE` nele mesmo
  e volta a entregar sozinho se a campanha for religada. Escrever `PAUSED` no
  status dele seria inventar uma pausa que ninguém pediu.
- **LIGAR não é certo.** Campanha ativa dentro de conta zerada não entrega
  nada. Escrever `ACTIVE` no efetivo seria prometer entrega que pode não
  existir, então ele é **apagado** e a tela cai no `status` até a Meta dizer
  como ficou.

### Fica registrado, inclusive o que falhou

Toda chamada vira uma linha em `meta_acoes`: quem, quando, qual objeto, o que
estava antes, o que foi pedido, deu certo ou não, e a frase da Meta no erro.

Pausar campanha é a primeira coisa que este sistema faz que **muda a realidade
da loja** em vez de só mostrá-la. Quando uma loja ficar um dia sem entregar, a
pergunta vai ser "quem desligou?" — e sem registro a resposta é um silêncio
constrangedor. A chamada que falhou é justamente a que interessa depois,
porque é ela que explica a campanha que "não desligou".

## A chave de liga/desliga

A coluna de status mostra a chave do Gerenciador, com o estado **real** de cada
campanha, conjunto e anúncio.

**Ela não liga nada ainda.** O token é só de leitura, e escrever pede
`ads_management` com um Usuário de Sistema na BM.

Clicar nela não finge que funcionou: ela não se move e explica por quê. Chave
que parece clicável e não faz nada é pior que chave nenhuma — a pessoa clica,
vê a animação e vai embora achando que pausou uma campanha que continua
gastando.

Quando o acesso de escrita chegar, é tirar a trava e ligar no servidor. O
desenho não muda.

**A semântica combinada**, que é a do Facebook: campanha pausada não entrega
nada; conjunto pausado para só ele; anúncio pausado para só ele. Pausar a
campanha **não** pausa os filhos — só impede a entrega.

---

## Onde fica o quê

```
src/lib/meta/
  cliente-graph.ts         o GET na Graph API (server-only, o token mora aqui)
  saldo.ts                 parse do saldo, formato em R$, níveis de alerta
  insights.ts              as contas, os períodos — PURO, serve aos dois lados
  sincronizar-saldo.ts     busca e grava o saldo
  sincronizar-insights.ts  busca e grava números (30 dias + vida inteira)
  sincronizar-criativos.ts busca e grava a arte
  sincronizar-estrutura.ts busca e grava campanhas e conjuntos
  varredura.ts             varre várias contas, com prazo e em paralelo
  contas-disponiveis.ts    o que o token enxerga, e o palpite por nome
  relatorio.ts             os números da folha do cliente

src/lib/actions/meta-ads.ts    vincular, atualizar, trocar o tipo de lead
src/app/(app)/meta-ads/        as telas
src/app/api/meta-ads/relatorio o PNG
```

### Tabelas

| Tabela | O quê |
|---|---|
| `meta_ad_accounts` | A conta vinculada à loja. `isPrepay`, `leadActionType`, saúde da última leitura |
| `balance_snapshots` | Cada leitura de saldo. Histórico, não campo sobrescrito |
| `meta_insights_daily` | Anúncio × dia, 30 dias. O grão fino |
| `meta_lifetime` | Um total por anúncio, desde o começo. Retrato, não histórico |
| `meta_ad_creatives` | Miniatura e link de pré-visualização |
| `meta_campaigns` / `meta_adsets` | Cadastro: nome, status, orçamento |

Tudo aqui é **cópia do que está na Meta**. Nada se perde de verdade se for
apagado — o robô reenche na próxima passada.

---

## Armadilhas já pisadas

Ficam escritas porque custaram tempo:

- **Um upsert por linha estoura a transação.** Cada upsert é uma ida e volta
  ao banco; 50 linhas são 50 viagens, e o Prisma derruba transação que passe
  de 5 segundos. Num banco local, que responde em 1 ms, isso nunca aparece.
  Hoje são duas consultas por conta: apaga a janela e insere em massa.
- **A Vercel MATA a função quando o tempo acaba** — sem erro, sem `catch`, sem
  mensagem. Por isso a varredura tem orçamento próprio (45 s) e para sozinha
  dizendo quantas faltaram.
- **`DROP TABLE` espera a trava, sem prazo.** Uma implantação ficou onze
  minutos pendurada. Migration que apaga tabela vai separada, com
  `lock_timeout`.
- **Server Action que lança erro derruba a tela inteira.** Todas as ações aqui
  passam por `semQuebrar`, que devolve frase em vez de página preta —
  deixando `redirect` e `notFound` do Next passarem, que são lançados de
  propósito.
- **Arquivo `server-only` não atravessa pro navegador.** O que a tela e o
  servidor compartilham mora em `insights.ts`, que é puro.
- **Testar só num tema esconde metade.** Uma faixa de `#f1f1f3` a 30% sobre
  branco é branco. Mudança visual passa pelos dois temas.
- **Uma palavra invisível fazia o celular rolar de lado.** O texto só-pra-
  leitor-de-tela (`sr-only`) é posicionado em absoluto; sem um ancestral
  posicionado ele se ancora na página inteira. Dentro de uma tabela que rola,
  ele ia parar no x=655 e esticava o documento até lá — a tela toda rolava de
  lado por causa da palavra "Atualizar", que ninguém vê. A célula leva
  `relative` pra prender o texto nela.

## Mandar o relatório no grupo do WhatsApp (Z-API)

Decisão do Guilherme em 13/11/2026, com o risco na mesa: o relatório vai pro
**grupo** de cada loja, e grupo é justamente o que a API oficial da Meta não
entrega bem. Por isso Z-API e não WhatsApp Business Platform.

**O risco, escrito pra não ser esquecido.** A Z-API não é oficial: ela conecta
um número comum pelo mesmo caminho do WhatsApp Web. A Meta pode bloquear esse
número, e bloqueia sem avisar. Por isso o número tem que ser **dedicado ao
robô** — se cair, para o envio automático, não o atendimento da agência.

### O que precisa estar configurado

Três variáveis na Vercel, em Production e Preview:

| Variável | Onde achar |
|---|---|
| `ZAPI_INSTANCE_ID` | painel da Z-API, na instância |
| `ZAPI_TOKEN` | painel da Z-API, na instância |
| `ZAPI_CLIENT_TOKEN` | painel da Z-API, em Segurança da conta |

Faltando qualquer uma, o sistema diz "não configurado" e o botão de mandar
nem aparece — em vez de aparecer e falhar.

Existe uma quarta, `ZAPI_BASE_URL`, que **não se define em produção**: ela
serve pra apontar os testes pra um servidor falso e assim exercitar o envio
sem mandar mensagem pro grupo de um cliente de verdade.

### A URL inteira é segredo

A Z-API põe o id da instância e o token no CAMINHO do endereço:

```
https://api.z-api.io/instances/{instancia}/token/{token}/send-image
```

Não é escolha nossa. A consequência é que a URL inteira vale como senha — e
URL é o que mais vaza, porque todo mundo loga URL sem pensar. Em
`src/lib/whatsapp/zapi.ts` a URL é montada dentro da função e morre nela:
nenhum erro, log ou retorno a contém. Conferido: depois de um envio bom e um
recusado, o log do servidor não tinha nenhuma ocorrência do token, da
instância nem do endereço.

### O grupo de cada loja

Na ficha da loja, bloco Meta Ads, campo **Grupo do WhatsApp**. O id vem do
painel da Z-API no formato `120363019502650977-group` — não é telefone de
ninguém.

Três travas, porque mandar o relatório de uma loja pro grupo de outra não tem
como desfazer:

1. **Só a direção cadastra** (ADMIN ou GERENTE).
2. **O formato é conferido duas vezes** — na hora de salvar, pra avisar a
   pessoa, e de novo na hora de enviar, que é a trava que realmente protege.
   Um telefone de pessoa (`5554999887766`) não passa em nenhuma das duas.
3. **O mesmo grupo não serve a duas lojas.** É quase sempre erro de
   digitação, e o estrago seria a loja A recebendo os números da loja B.

### A ordem do envio: manda primeiro, marca depois

Nunca o contrário. Marcar antes seria mais fácil de escrever e criaria o pior
defeito possível: a Z-API fora do ar, o cliente sem receber nada, e a tela
dizendo "enviado" pra todo mundo — ninguém descobriria até o dono cobrar.

Do jeito certo, o pior caso é o oposto e é muito melhor: a mensagem sai, a
marcação falha, a loja continua pendente, alguém manda de novo e o grupo
recebe duas vezes. Chato, visível, sem dano.

Conferido no navegador com uma Z-API falsa: a loja cujo grupo a Z-API recusou
**não** foi marcada como enviada, e o erro apareceu na linha dela — não num
aviso genérico no topo, que com quarenta lojas não diria em qual.

### O que ainda é na mão

O envio é por botão, um de cada vez. Mandar a casa inteira de uma vez, sozinho
na segunda de manhã, é o passo seguinte — e é o que exige cuidado com ritmo:
quarenta mensagens em rajada de um número não oficial é o jeito mais rápido de
ele ser bloqueado.
