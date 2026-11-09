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
8h de Brasília** (`vercel.json`, `0 11 * * *` em UTC).

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
