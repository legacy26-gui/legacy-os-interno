# Venda por lead, registrada pelo robô

Quando avisam no grupo da loja que um carro foi vendido, o robô registra a venda no
Controle de Vendas e parabeniza o grupo — **só se a venda veio de lead do anúncio**.

```
@robô vendeu o Virtus 2021 por 68 mil, foi lead

Pronto, tirei *VOLKSWAGEN VIRTUS 1.6 MSI AUTOMÁTICO 2021* do ar.

🎉 Parabéns pela venda, pessoal! Essa é a *3ª venda do mês* — resultado excepcional!
O anúncio desse carro consumiu *R$ 1.230,00* até vender.
```

Quem avisa: qualquer pessoa do grupo, marcando o robô com @ (a mesma regra da pausa).

## Duas coisas que a frase quase nunca traz

Pra entrar no controle a venda precisa do **valor** e de saber se veio de **lead**.
"vendeu o Virtus" não traz nenhuma das duas. O robô lê o que a frase tem e
**pergunta o que falta, no grupo**:

| A frase diz | O robô |
| --- | --- |
| valor e "lead" | registra na hora |
| só o valor | pergunta só se veio de lead (responde *sim* ou *não*) |
| só "foi lead" | pergunta só o valor |
| nada | pergunta as duas, com o preço do anúncio como dica |
| "foi balcão" / "indicação" | parabeniza e diz que **não conta** no controle |

A resposta precisa marcar o @ de novo: a regra do @ vale pra toda mensagem. A
pergunta fica aberta por 48 horas, uma por grupo.

## "Somente de venda por leads"

Regra do Guilherme. O Controle de Vendas mede o resultado do trabalho da agência, e
uma venda de balcão ou de indicação não é resultado dele — contá-la faria a loja
parecer mais bem atendida do que está. Por isso a origem é uma **pergunta de
verdade**, não um palpite: "veio na loja por causa do anúncio" tem os dois sinais, e o
robô não escolhe — pergunta.

## O valor, lido com cuidado

Reconhece `R$ 68.500`, `68.500`, `68 mil`, `68k`, `68,5 mil`, `68500`. Descarta:

- **quilometragem**: "45 mil km" não é valor de venda
- **ano**: "2021" não é valor
- o que está fora da faixa de preço de carro (R$ 3 mil a R$ 2 milhões)
- **dois valores diferentes** na frase ("vendeu por 68 mil, entrada de 20 mil"): não
  tem UM valor de venda, e escolher o primeiro registraria um número que ninguém
  confirmou. Pergunta.

O **preço escrito no anúncio** aparece na pergunta como dica ("o anúncio estava com
R$ 69.900"), mas **nunca vira o valor da venda sozinho**: o carro costuma fechar
abaixo do pedido.

## O que fica registrado

- **Valor**: o da frase ou da resposta.
- **Gasto**: o **total** do carro (a soma dos anúncios dele, o Ka e o Ka "Cópia"),
  pelo mesmo acumulado que o Copiloto usa pra "quanto gastou".
- **Data**: hoje, no dia de Caxias.
- **Origem**: `robo-whatsapp`, e os anúncios do carro. Aparece como "pelo robô do
  WhatsApp" no Marcar Venda e no Venda a venda.

## O parabéns

- **"Essa é a Nª venda do mês"**: contada no Controle de Vendas, **depois** de gravar
  (a que acabou de entrar é a n-ésima). Venda do mês passado não conta.
- **"Resultado excepcional"**: só a partir da **3ª venda do mês** ("acima de 2",
  decisão do Guilherme). Palavra forte demais pra gastar à toa, e o cliente percebe
  quando o elogio é automático.
- **Quanto o anúncio consumiu**, quando houver gasto.

## Defesas

| Situação | O robô faz |
| --- | --- |
| O mesmo carro avisado de novo | "já está registrada" — não vira outra venda (30 dias) |
| Dois carros na mesma frase | Pausa os dois, mas pede **uma venda de cada vez**: "qual valor é de qual?" |
| Pergunta aberta sobre um carro e aviso de outro | Fecha a primeira antes |
| O carro já estava pausado | Registra a venda e **não** diz "não está no ar" |
| Loja fora do Controle de Vendas (consórcio, banco) | Pausa como sempre, sem registrar nem parabenizar |
| Mensagem com "?" ou comprida, com a pergunta aberta | É conversa, não resposta |
| Pergunta vence (48h) | A resposta tardia não registra |

## Desfazer

O robô pode errar um valor, e a venda dele não tem `createdById` — sem uma porta
própria, **ninguém** poderia apagá-la. Em **Marcar Venda → Últimas vendas marcadas**
a venda do robô tem o botão de apagar para quem enxerga aquela loja (o mesmo filtro
que monta a lista). Gestor de outra loja não apaga, e venda lançada por gente
continua só apagável por quem lançou.

O gestor da loja recebe no privado o que foi registrado, com valor e gasto, e o
caminho pra desfazer.

## Onde está

| Arquivo | O que faz |
| --- | --- |
| `src/lib/vendas/interpretar-venda.ts` | lê valor, origem e preço; escreve as mensagens (puro) |
| `src/lib/vendas/venda-por-lead.ts` | a conversa, a pendência e o registro |
| `src/lib/whatsapp/entender-pedido.ts` | `pedeVenda`, e "vendi"/"vendemos" como aviso |
| `src/lib/whatsapp/atender-grupo.ts` | encaixa tudo na mesma mensagem da pausa |
| `src/lib/actions/marcar-venda.ts` | o desfazer da venda do robô |

Migração `20261120180000_venda_por_lead`: `client_sales.origem` e `.anuncioIds`, e a
tabela `vendas_aguardando_dados`.

## O que foi conferido, e o que não foi

Contra Z-API e Meta falsas, banco de teste: registro com tudo na frase; a 1ª, 2ª e 3ª
venda do mês (e a do mês passado não conta); o Ka com dois anúncios soma o gasto e
pausa os dois; a pergunta e a resposta; "sim"/"não" quando só faltava a origem; "foi
balcão" não registra; aviso repetido; carro já pausado; dois carros; quilometragem
não vira valor; pergunta vencida; loja fora do controle; e quem pode apagar.

**Não foi conferido:** uma venda real num grupo de cliente, e a recepção do parabéns
pelo cliente. Na primeira venda real, vale o Guilherme conferir a mensagem no grupo
e o lançamento no Controle de Vendas.


## Valor, origem e parabéns (ajuste depois do primeiro uso)

- **Origem**: "tráfego", "anúncio", "lead", "instagram" na frase já bastam. Se a pessoa
  disse, o robô não pergunta de novo.
- **Valor**: se a frase não traz, o robô usa o **preço que está no anúncio** e registra
  direto. O aviso ao gestor diz "(o preço do anúncio — ninguém disse o valor)", pra ele
  corrigir em Marcar Venda se saiu por outro valor. Só pergunta quando o anúncio não tem preço.
- **Parabéns**: vai pra LOJA pelo nome ("Parabéns, *Vilela Motors*, pela venda!"), com a
  venda do mês e, sempre que há dado, o valor investido no carro e os leads.
- As perguntas não trazem mais exemplo ("68 mil"): só "Qual foi o *valor* da venda?".
- **Formato do parabéns** (cada dado na sua linha, só quando há dado):
  ```
  🎉 Parabéns, *Vilela Motors*, pela venda!
  Valor investido: *R$ 200,00*
  Leads: *40*
  ```
  A **1ª venda do mês nunca diz que é a primeira**. Da 2ª em diante entra "Essa é a *Nª venda
  do mês*", e da 3ª o "resultado excepcional!".
- **Valor**: a regra da casa é contar o preço do anúncio quando a pessoa não disser outro.

## Pausar CONJUNTO (pedido do Guilherme)

Quando a frase tem a palavra **"conjunto"** ("pausa o conjunto do Versa"), o robô pausa o
conjunto inteiro — e os anúncios dentro dele param junto. Vale no grupo (direto) e no privado
(com a confirmação "sim", como sempre).

- Sem a palavra "conjunto", nada muda: continua tirando o anúncio do carro.
- A busca é pelo NOME do conjunto, com o mesmo leitor dos anúncios (erro de digitação vira
  pergunta; dois parecidos viram "qual destes?"; nunca pausa por aproximação).
- Se nenhum conjunto tem esse nome, o robô tira os anúncios do carro e diz: "Não achei um
  conjunto com esse nome, então fiz pelos anúncios do carro."
- A resposta diz quantos anúncios estavam dentro do conjunto.
- Quando a Meta recusa, a equipe da loja é avisada de verdade (antes a resposta dizia "já
  avisei a equipe" sem avisar).

### Conjunto vazio sai junto

Depois de tirar os anúncios de um carro (no grupo ou no privado, com ou sem a palavra
"conjunto"), o robô olha o conjunto onde eles estavam:

- **Nenhum anúncio ligado sobrou** → pausa o conjunto também e diz: "Como não sobrou nenhum
  anúncio ativo nele, pausei também o conjunto *X*."
- **Ainda tem outro carro ligado** → o conjunto fica como está.

"Ligado" é o que a pessoa deixou ligado (status não pausado/arquivado/excluído); o robô não
usa o status efetivo, que também fica "pausado" quando falta saldo. Anúncio ainda não
sincronizado (sem conjunto no cadastro) não conta: sem saber o que há dentro, não pausa.


## Pelo privado, só o dono (quando o grupo não entende)

O grupo só funciona se o robô entende a frase. Quando não entende (foi o caso do Vilela: *"foi do
patrocinado"* não era reconhecido como lead), o dono manda a mesma frase **pro robô no privado**:

> vilela vendeu o versa, foi do patrocinado

O robô **não faz nada na hora**. Responde dizendo **loja, carro, origem, valor** e quais anúncios
vai pausar, e só age com um **"sim"** (vale 10 minutos, só pra próxima mensagem):

- origem não dita → pergunta *lead* ou *balcão*; valor não dito → usa o preço do anúncio (e diz que
  foi isso); sem preço no anúncio → pergunta; "foi 70 mil" corrige o valor antes do "sim";
- **lead**: registra no Controle de Vendas (mesmo `registrar` do grupo) e pausa os anúncios do carro
  que estão no ar; **balcão / loja fora do controle / venda já registrada**: só pausa;
- devolve o texto de parabéns **pronto, sem mandar** no grupo da loja (quem manda é o dono);
- carro em mais de uma loja, loja que não existe, mais de um carro na frase: pergunta, não chuta.

Só **ADMIN**. Gestor continua com "pausa o X da loja Y" (com confirmação); "vendeu" no privado de
gestor segue sendo só conversa. Código: `src/lib/vendas/venda-no-privado.ts` (+ a pendência
`registrar-venda` em `pausar-no-privado.ts`). Teste: `t-venda-privado.mjs`.

A origem agora reconhece *patrocinado, impulsionado, impulsionamento* como anúncio, e *orgânico* como
fora de lead (`interpretar-venda.ts`).

## Nome de anúncio colado inteiro (grupo e privado)

Quando a mensagem traz o **nome inteiro** de um anúncio (copiado do Gerenciador), o robô não adivinha por
palavras: acha o anúncio pelo nome e age, sem "qual destes?". Vale pra um ou vários nomes, em linhas ou na
mesma linha. Antes, palavras soltas ("16v", "flex") puxavam carros sem relação (March, Renegade) e os dois
Peugeot empatavam entre si. Só vale nome com 3+ palavras de verdade; "Gol" solto segue a leitura de sempre.
Se um nome está dentro de outro, vale o mais comprido. Código: `acharPeloNomeCompleto` em `entender-pedido.ts`.
