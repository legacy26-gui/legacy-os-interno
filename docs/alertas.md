# Central de Alertas

A tela **Alertas** responde uma pergunta só: *o que precisa da minha ação
hoje?* Cada pessoa vê os alertas dela, com link pro lugar onde se resolve.

## Quem recebe o quê

| Alerta | Quem recebe | Vai resolver em |
| --- | --- | --- |
| Loja sem vender | Andrielli | Controle de Vendas |
| Gravação atrasada | Andrielli | Gravações |
| Implantação parada | Andrielli | Formulários |
| Mensalidade vencida | Só o dono | Financeiro |
| Cliente sem verba | O gestor da loja (sem gestor: o dono) | Meta Ads da loja |
| Relatório não enviado | O gestor da loja; a Andrielli de quarta em diante | Meu Dia |

Gestor de tráfego não recebe alerta nenhum — foi decisão do Guilherme.

Trocar quem recebe é mexer num arquivo só:
`src/lib/alertas/destinatarios.ts`.

## As quatro travas

Antes de um alerta chegar em alguém, ele passa por quatro conferências, e
todas têm que dar certo:

1. **É dessa pessoa?** (o roteamento da tabela acima)
2. **Ela trabalha nessa empresa?**
3. **A tela do alerta existe nessa empresa?**
4. **Ela pode abrir essa tela?**

As três últimas existem porque a primeira é lista escrita à mão, e lista
escrita à mão erra. Se amanhã alguém puser o sócio do Treinamentos como
destinatário de um alerta da agência por descuido, as outras três barram
sozinhas. É o mesmo princípio do resto do sistema: a separação vale na
consulta, não no menu.

A trava 4 também evita o alerta que leva pra porta trancada — que é pior que
alerta nenhum, porque a pessoa vê o problema e não tem como agir.

## Por que "só o dono" e não "ADMIN"

O sócio do Legacy Treinamentos também é **Administrador** no sistema. Roteando
mensalidade por cargo, ele passaria a receber no celular o aviso de mensalidade
vencida do Treinamentos — e as travas de empresa deixariam passar com razão,
porque é o dinheiro da empresa dele. Só que o pedido foi "mensalidade avisa só
eu".

Então "dono" é **o ADMIN que enxerga o grupo inteiro**, a mesma definição que o
sistema já usa pra liberar a visão consolidada. É isso que também controla a
aba "Da equipe" e o botão "Conferir agora".

Pra o sócio passar a receber as mensalidades da empresa dele, troca-se a
função `ehODono` por `p.role === "ADMIN"` e mais nada: as travas de empresa
cuidam do resto, e ele continua sem ver um centavo da agência.

## As faixas

Cada alerta tem três degraus de gravidade, e a cor é a mesma escada do
Controle de Vendas (amarelo → vermelho → vermelho sólido).

| Alerta | Amarelo | Vermelho | Vermelho sólido |
| --- | --- | --- | --- |
| Loja sem vender | 7 dias | 15 dias | 30 dias |
| Gravação atrasada | 1 dia | 3 dias | 7 dias |
| Mensalidade vencida | 1 dia | 3 dias | 7 dias |
| Implantação parada | 3 dias | 3 dias | 7 dias |

Loja sem vender usa os prazos de `src/lib/controle-vendas.ts` — não é cópia, é
a mesma função. A tela e o alerta não podem discordar.

## O celular só vibra quando piora

O degrau não é enfeite: é ele que decide se o aviso vai pro celular. **O aviso
só sai quando o problema sobe de degrau.** Loja parada há três semanas avisa
uma vez aos 7 dias, de novo aos 15 e de novo aos 30 — e mais nada no meio.

Sem isso, a equipe receberia o mesmo aviso todo dia, desligaria a notificação
em uma semana e o sistema perderia a voz pra sempre.

Além disso, o aviso é **agrupado por tipo**: três gravações atrasadas viram um
aviso só ("3 × Gravação atrasada"), não três. A tela mostra o detalhe; o
celular mostra o resumo.

## O alerta dentro do sistema

O sininho fica no cabeçalho, então aparece em **qualquer tela**. Clicar nele
abre um painel por cima do que a pessoa está fazendo — ela pode estar em
Gravações, em Clientes, onde for, e resolve sem sair dali.

Quando aparece coisa nova, um **aviso de canto** se apresenta sozinho, porque
ninguém fica olhando pro sininho. Ele aparece **uma vez por aba do navegador**
e some sozinho. A marca do que já foi mostrado carrega a lista dos alertas
junto, então um problema novo faz o aviso voltar, mas navegar pelo sistema não
faz ele reaparecer a cada clique.

### "Visto" é diferente de "avisado"

São dois controles separados, e isso não é duplicação:

- **`nivelAvisado`** — até onde já vibrou o celular. Quem zera é o robô.
- **`nivelVisto`** — até onde a pessoa já viu dentro do sistema. Quem zera é
  ela abrir o painel ou a tela de Alertas.

Se fossem um só, bastaria o push não estar configurado pra todo alerta ficar
"novo" pra sempre, e o aviso de canto apareceria eternamente. E ver na tela
não substitui o aviso no celular, que é o que alcança quem está fora do
sistema.

Ver não marca nada como resolvido: o alerta continua na lista, igual. Só para
de se apresentar como novidade.

## Não existe "dispensar"

Dá pra **lembrar amanhã** — o alerta sai da frente e volta no dia seguinte.
Não dá pra dizer "resolvido", e é de propósito: alerta que se apaga com clique
vira clique automático em duas semanas, e aí a central passa a mentir, dizendo
que está tudo em ordem com a casa pegando fogo.

Um alerta só desaparece quando o problema é resolvido **no sistema**: a
gravação marcada como entregue, a venda lançada, a mensalidade recebida, a
etapa marcada na ficha.

## Alerta não é linha gravada

O alerta é calculado na hora, perguntando ao banco. Não existe tabela de
alertas que alguém precise criar e apagar — isso daria alerta fantasma (o
problema já foi resolvido e o aviso continua lá) e alerta perdido (o problema
nasceu e ninguém gravou).

O que fica gravado (`alerta_estados`) é só o que o banco não sabe sozinho: até
qual gravidade cada pessoa já foi avisada, e o que ela pediu pra lembrar
depois.

## O robô

Página só roda quando alguém abre, então sem um relógio de fora ninguém
descobre que a gravação de ontem não foi entregue. O robô é
`/api/alertas/rodar`, chamado pelo agendador da Vercel **uma vez por dia, às
9h de Brasília** (`vercel.json`, `0 12 * * *` em UTC). Era 8h; o Guilherme mudou pra 9h.

Uma vez por dia basta: os quatro alertas são todos de ritmo diário — nenhum
muda de hora em hora. É por isso que a central funciona no plano grátis da
Vercel, que só permite agendamento diário.

O robô pode rodar quantas vezes quiser no mesmo dia: ele só avisa o que ainda
não avisou. É isso que permite o botão **"Conferir agora"** na tela, sem risco
de encher o celular de ninguém.

### A tela não depende do robô

Se o robô parar, a central continua certa — só para de avisar no celular. É de
propósito: a parte que mais tem como falhar (o agendamento, que vive fora do
sistema) é a que menos faz falta.

### Por que a rota funciona sem configurar nada

O jeito mais fechado é pôr um `CRON_SECRET` nas variáveis da Vercel: ela passa
a mandar esse segredo sozinha em toda chamada do agendador, e a rota recusa
qualquer outra pessoa. **Se a variável existir, é isso que acontece.**

Sem ela, em vez de a central inteira ficar sem robô, a rota aceita a chamada e
se protege de outro jeito. A pergunta certa é o que alguém ganharia chamando
isso de fora:

| | |
| --- | --- |
| Pegar dado? | Não. A resposta traz números, nenhum nome de cliente ou valor. |
| Encher o celular da equipe? | Não. O robô só avisa o que PIOROU desde a última vez — mil chamadas mandam zero avisos. |
| Custo? | É o que sobra, e é o que o acelerador corta: sem segredo, a rota só trabalha de verdade uma vez a cada 15 minutos. |

O pior caso de abuso é a conferência do dia acontecer mais cedo. Em troca, o
robô funciona no dia em que entra no ar, sem depender de ninguém lembrar de
criar uma variável. Pôr o `CRON_SECRET` depois fecha a porta de vez, e não
exige mexer em mais nada.

O **push pro celular**, esse sim, precisa das variáveis `VAPID_*`. Sem elas a
central funciona inteira — sininho, painel, aviso de canto — e só o telefone
não toca.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/lib/alertas/tipos.ts` | o formato do alerta, rótulos e cores |
| `src/lib/alertas/calcular.ts` | de onde cada alerta nasce (as consultas) |
| `src/lib/alertas/destinatarios.ts` | quem recebe o quê, e as quatro travas |
| `src/lib/alertas/robo.ts` | o robô e a leitura da tela |
| `src/lib/actions/alertas.ts` | lembrar amanhã, voltar a ver, conferir agora |
| `src/app/(app)/alertas/` | a tela |
| `src/components/sininho-alertas.tsx` | busca os alertas pro cabeçalho |
| `src/components/painel-alertas.tsx` | o sininho, o painel e o aviso de canto |
| `src/app/api/alertas/rodar/route.ts` | a porta que o agendador chama |
| `vercel.json` | o horário do robô |

Migração: `20261109160000_central_de_alertas`.

## Pra acrescentar um alerta novo

1. Escreve a consulta em `calcular.ts` e devolve `Alerta[]`.
2. Põe o tipo novo em `TIPOS_DE_ALERTA` e o rótulo em `ROTULO_DO_TIPO`.
3. Diz quem recebe em `QUEM_RECEBE`.

Tela, sininho, celular, anti-spam e "lembrar amanhã" já funcionam sozinhos —
não se mexe em nenhum deles. A obra foi a engrenagem; alerta novo é regrinha.

**Cuidado ao escolher a `chave`:** o mesmo problema tem que dar a mesma chave
amanhã, senão o anti-spam não reconhece e o aviso sai de novo todo dia. Nunca
entra data nem contagem na chave.


## Aviso no WhatsApp

Quem tem número cadastrado em Configurações recebe os avisos **no WhatsApp**,
e só lá. Quem não tem continua recebendo no app, como sempre foi. A troca é
de canal, não soma: o mesmo problema vibrando duas vezes no mesmo celular é o
que faz a pessoa desligar as duas notificações.

### Um recado por pessoa

O robô manda **uma mensagem** por pessoa por dia, com seções, e não uma por
alerta. A Z-API não é oficial: ela conecta um número comum pelo caminho do
WhatsApp Web, e rajada de mensagem desse número é o jeito mais rápido
conhecido de bloqueá-lo — e bloqueado, para o envio da casa inteira,
relatórios dos clientes incluídos. Entre uma pessoa e outra há uma pausa
sorteada de 4 a 9 segundos, porque intervalo igual entre todas as mensagens é a
assinatura de um robô.

```
Oi, Giovana! Hoje precisa de atenção:

*Cliente sem verba*
• *Podium* — Conta zerada — a campanha para hoje
• *Real Veículos* — Saldo R$ 40,00 — dura 1 dia

*Relatório não enviado*
• *Real Veículos* — O envio automático falhou — manda pelo Meu Dia

Resolve pelo Legacy OS. Se já tratou, é só ignorar: eu só volto a falar
disso se piorar.
```

### Só de segunda a sexta

Decisão do Guilherme: fim de semana ninguém é incomodado. Nada é anotado como
"avisado" no sábado e no domingo, então segunda às 9h sai tudo que estiver em
aberto, com o estado de segunda. O dia é o de **Caxias** (America/Sao_Paulo),
não o do servidor: às 22h de sexta o UTC já virou sábado.

O fim de semana vale só pro WhatsApp. Quem recebe no app continua como era.

### Se o WhatsApp falhar, o aviso não morre

Se a Z-API recusar o recado, o aviso cai no app, que é o canal de antes. E
nada é anotado como entregue enquanto não chegar em algum lugar — então o
robô tenta de novo no dia seguinte, em vez de achar que já avisou.

## Cliente sem verba

A régua é a do Meu Dia, de propósito: **não chega no próximo abastecimento**.
A loja abastece por semana, então sete dias de saldo não é alerta, é o tanque
cheio.

| Degrau | Quando | O que quer dizer |
| --- | --- | --- |
| Amarelo | 3 dias de saldo ou menos | Hora de cobrar o Pix da semana |
| Vermelho | 2 dias ou menos | O Pix já está atrasado |
| Crítico | Conta zerada, ou menos de 1 dia | A campanha para sozinha, hoje |

Fica de fora, como na tela: conta no cartão (não tem saldo), e a loja com link
de Pix já mandado e no prazo (o azul do Meu Dia) — alguém já tratou, e avisar
de novo seria cobrar quem já agiu. Se o prazo vencer e o dinheiro não vier, ela
volta sozinha.

Mora em `src/lib/meta/lojas-sem-verba.ts` e passa pela mesma função que a tela
(`avaliarLoja`), então a tela e o aviso **não podem discordar**. Está testado:
zerada, acabando, atenção, cheia e cobrada dão o mesmo tom na tela e o mesmo
degrau no alerta.

**Por que não reaproveita o painel inteiro do Meu Dia:** o sininho do cabeçalho
recalcula todos os alertas a cada página aberta. O painel faz quatro agregações
sobre o histórico de insights, e três delas (artes cansadas, projeção do mês)
não têm nada a ver com saldo. Pendurar isso ali faria cada clique, de cada
pessoa, rodar tudo só pra saber se uma conta zerou.

## Relatório não enviado: agora diz o motivo

Antes dizia só "ainda não enviado", e isso era verdade pra três situações que
pedem três pessoas diferentes:

| Situação | Quem resolve | O que o aviso diz |
| --- | --- | --- |
| Aguardando aprovação | A Andrielli | "Aguardando aprovação da Andrielli — custo por lead de R$ 12 ou mais" |
| O envio automático falhou | O gestor | "O envio automático falhou — manda pelo Meu Dia" |
| Loja sem grupo de WhatsApp | O gestor | "Sem grupo de WhatsApp cadastrado — manda pelo Meu Dia" |

Quem espera aprovação **não cobra o gestor**: ele não tem o que fazer, e cobrar
quem não pode agir ensina a ignorar o aviso.

### Segunda de manhã não é aviso

Na segunda às 8h o robô dos relatórios está mandando os da casa inteira, sozinho.
Avisar o gestor ali seria dizer "o relatório está pronto pra enviar" cinco
minutos antes de ele sair. O nível 1 continua na tela, mas só vai pro WhatsApp
a partir de quarta (nível 2) — e aí sobra só quem de fato ficou pra trás.
Quando o aviso de quarta sai, a verba que já foi avisada na segunda não repete.

Isso mora em `NIVEL_MINIMO_NO_WHATSAPP` (`src/lib/alertas/tipos.ts`).

## O que foi conferido

Contra Z-API falsa e banco de teste, passando o robô por quarta, de novo na
quarta, uma piora, sábado e segunda:

- um recado só por pessoa, com o que é dela e nada da carteira de outro gestor
- a segunda execução do mesmo dia não manda nada
- a piora de um degrau manda só o que piorou
- sábado: nada sai e nada fica anotado
- segunda: sai a verba, não o relatório, e o relatório não fica marcado como
  avisado (pra poder sair quarta)
- Z-API recusando: contado, cai no app, e não anota "já avisei"
- sem a Z-API ligada: tudo cai no app, como era
- no navegador: a tela de Alertas mostra "Cliente sem verba — Conta zerada" e o
  botão leva pra loja

**Não foi conferido:** a entrega num WhatsApp de verdade. Isso só a produção
responde, e só depois que os números dos gestores estiverem cadastrados. O
primeiro dia útil depois disso é o teste.

## WhatsApp do robô desconectado (vigia)

Se o número do robô cai (celular sem bateria/internet, sessão expirada), relatórios, avisos e pausas
pelo WhatsApp param calados. O vigia (`src/lib/whatsapp/vigia-conexao.ts`) descobre por dois caminhos:

1. **A Z-API avisa** (`DisconnectedCallback` / `ConnectedCallback`) quando o endereço do webhook também
   está em **Ao desconectar** e **Ao conectar** no painel dela. Vale na hora.
2. **A varredura de 15 em 15 minutos** pergunta o status. Só a **segunda** conferência seguida com falha
   conta como queda (até 30 min), pra lentidão da Z-API não virar alarme.

Ao cair: **push no celular do dono** (não pelo WhatsApp — é ele que caiu) e um alerta **crítico** no
sininho ("WhatsApp do robô fora do ar", só pro dono, leva pra Configurações → WhatsApp) enquanto durar.
Ao voltar: outro push ("voltou depois de X fora") e o alerta some. No meio, silêncio. O estado fica na
tabela `conexao_whatsapp` (uma linha).
