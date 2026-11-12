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
