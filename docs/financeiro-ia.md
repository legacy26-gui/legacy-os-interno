# Financeiro pela IA — o grupo de gastos

O Guilherme anota **cada gasto** num grupo de WhatsApp só dele ("financeiro (gastos)") e o robô
lança no financeiro: gasto da empresa vai pro DRE; gasto pessoal vira **retirada**.

## Quem entende a mensagem: a IA, com travas em código

Desde o print "Tatiana salário já está pago : 2300, tira do contas a pagar deste mês" (que virou um gasto
novo com a frase inteira de descrição), **a IA lê cada mensagem do grupo** como um contador leria
(`src/lib/financeiro-ia/interprete.ts`). Ela recebe o que está anotado — **contas a pagar abertas**,
**perguntas abertas** de pessoal/empresa, os nomes da **equipe**, se o saldo foi informado — e devolve ações:

`lancar_gasto` · `anotar_a_pagar` · `dar_baixa` (pagou agora) · `ja_estava_pago` · `remover_a_pagar` ·
`atualizar_saldo` · `decidir_pendente` · `consultar` (gastos, saldo/projeção, a pagar, resumo) · `nada`

Quando não tem certeza, ela **pergunta** em vez de agir.

O código confere antes de mexer em dinheiro (`validar-interpretacao.ts`):
- valor que **não está escrito** na mensagem é descartado ("Fiquei sem fazer: …");
- conta a pagar e pergunta aberta só pelos ids da lista que ela recebeu;
- descrição com cara de frase inteira ou de ordem ("já está pago", "tira do contas a pagar") é recusada.

**"Já estava pago" × "paguei agora".** Se você informou o saldo hoje e diz que a Tatiana *já estava*
paga, o pagamento é registrado ANTES da conferência do saldo — já está dentro do número que você
deu, e não desconta de novo. "Paguei a Andrielli" (agora) desconta. O caixa usa o **momento do
pagamento** (`paidDate`), não o do cadastro: o salário fixo criado no dia 1 e pago hoje sai do saldo hoje.

`desfaz` e as respostas curtas (`pessoal`, `empresa`, `1 pessoal 2 empresa`) continuam sem IA.
**Sem IA** (chave ausente ou erro), valem as regras de antes — com a mesma trava de frase inteira: o
robô pergunta "é um gasto novo, uma conta a pagar ou o pagamento de uma conta?" em vez de lançar.

Gasto fixo (gerado todo mês) não é apagado por "não vou pagar": o sistema recriaria; o robô explica
e manda ajustar na tela.

## Ligar

1. Criar o grupo no WhatsApp com o número do robô.
2. Legacy OS → Configurações → WhatsApp → **Grupo financeiro (seus gastos)** → marcar o grupo.
   Quem marca é o dono: só as mensagens do número DELE viram lançamento (o número precisa
   estar no cadastro do usuário). Grupo de loja e grupo interno não podem ser financeiro.

## Como escrever

| Mensagem | O que acontece |
|---|---|
| `almoço 45` | Empresa (Agência), Alimentação, hoje |
| `almoço 45, uber 23 e mercado 310` | três lançamentos numa mensagem |
| `gasolina 200 pessoal` | Pessoal (retirada), Combustível |
| `mercado 310` | **pergunta**: pessoal ou empresa? |
| `pessoal` / `empresa` / `1 pessoal, 2 empresa` | responde a pergunta aberta |
| `contador 450 treinamentos` | Empresa **Treinamentos** |
| `ontem: gasolina 200, almoço 40` | os dois com a data de ontem (`dia 15`, `15/11` também valem) |
| `desfaz` | apaga o último lançamento (ou descarta a pergunta aberta) |
| `resumo` / `quanto gastei esse mês?` | total empresa, total pessoal e as categorias com % |

Não precisa marcar o robô com @ nesse grupo. Mensagem sem número (um "bom dia") passa em silêncio.

## Saldo em caixa e projeção do fim do mês

**Dizer o saldo** no grupo (texto ou áudio) atualiza o *Saldo em banco* do Financeiro, igual ao
formulário da tela:

| Mensagem | O que acontece |
|---|---|
| `meu saldo é 12.500` / `saldo 12500` / `tenho 8 mil no banco` | grava o saldo de hoje |
| `saldo negativo de 500` | grava −R$ 500 |
| `saldo 5.000 treinamentos` | o caixa do Treinamentos (o padrão é a Agência) |
| `qual meu saldo?` / `como vou fechar o mês?` / `projeção` | responde saldo + projeção |

- Dizer o saldo de novo mostra a diferença: *"Eu calculava R$ 11.980: faltaram R$ 520"* — é o que
  ficou sem anotar. Se bater, diz que bateu.
- Dois valores na frase (`saldo 12 mil e 500`): o robô pergunta e **não grava nada**.
- A partir do saldo, cada gasto anotado sai dele e cada entrada confirmada soma. **Gasto lançado
  no mesmo dia, depois de informar o saldo, já desconta** (antes só descontava a partir do dia
  seguinte); o que foi lançado antes de informar já está dentro do número que você disse.
- Retiradas pessoais também saem do caixa.

### Contas a pagar: o que FALTA sair

Dizer o que ainda vai ser pago não é um gasto — é uma **conta a pagar**, que entra na projeção
do fim do mês e só desconta do caixa quando for paga:

| Mensagem | O que acontece |
|---|---|
| `gastos faltam andrielli e brendon 7.500, tatiana já está paga, igor tbm` | anota **uma** conta "Andrielli e Brendon" R$ 7.500 (vence no fim do mês); Tatiana e Igor são repetidos como "não contei (já pagos)" |
| `falta pagar aluguel 3.200 dia 25` | conta a pagar com vencimento dia 25 |
| `o que falta pagar?` | lista as contas a pagar anotadas (inclui os fixos ainda não confirmados) |
| `paguei andrielli` | dá baixa na conta (valor inteiro), com a data de **hoje** — é hoje que sai do caixa |
| `paguei andrielli 3.750` | baixa **parcial**: vira um gasto pago de 3.750 e a conta a pagar encolhe o mesmo tanto |
| `paguei uber 23` (sem conta a pagar com esse nome) | gasto comum, como sempre |

- Gente da equipe é empresa: o robô **não** pergunta "pessoal ou empresa?" nesse caso.
- "andrielli e brendon 7.500" é **um** valor para os dois; pra separar, escreva `andrielli 3.750, brendon 3.750`.
- Sem valor ("faltam pagar andrielli") o robô não inventa nada.
- `desfaz` apaga a última conta a pagar anotada, mas **não desfaz uma baixa** (pagamento): se deu baixa errada,
  ajuste na tela de Entradas e saídas.

**Projeção do fim do mês** (cartão no topo do DFC e resposta no grupo):

```
Saldo em caixa hoje
(+) A receber no mês              ← o mesmo "A receber" da Análise financeira
(−) Fixos e contas a pagar        ← saídas do mês ainda não confirmadas
(−) Gastos do dia a dia           ← estimativa: média por dia do mês × dias que faltam
= O mês fecha com
```

- Entradas já confirmadas NÃO são somadas de novo: já estão dentro do saldo.
- O "dia a dia" é a única estimativa (variáveis + retiradas do mês); o resultado **sem** ele vem logo
  abaixo, pra ver os dois.
- Cobrança atrasada de meses anteriores fica **fora da conta** e aparece numa linha à parte.
- Sem saldo informado, não há projeção: o robô pede o saldo.

## Áudio

Pode falar em vez de digitar, no grupo financeiro: "gastei quarenta e cinco reais no almoço e
vinte e três de Uber com o Igor". O robô transcreve, converte os números por extenso
("quarenta e cinco" → 45) e lança como se tivesse sido digitado — inclusive a pergunta
"pessoal ou empresa?", as respostas ("pessoal") e as perguntas de quanto gastou.

- Toda resposta a um áudio começa com **🎙️ Ouvi: "…"**: a transcrição erra, e é por esse eco que
  dá pra ver o que foi entendido (e usar o *desfaz*).
- Áudio sem gasto: o robô diz que ouviu e que não achou gasto (texto sem número fica calado).
- Até **2 minutos** por áudio.
- **Só o áudio do dono, no grupo financeiro** é baixado e transcrito. Qualquer outro (outra pessoa,
  outro grupo) é ignorado sem baixar nada — transcrever custa dinheiro e manda o áudio pra fora.
- Precisa de **`OPENAI_API_KEY`** na Vercel (a transcrição usa a OpenAI, mesmo que o Copiloto
  use outro provedor). Sem ela o robô diz "não consegui ouvir" e não lança nada.
  Modelo: `gpt-4o-mini-transcribe` (troca com `TRANSCRICAO_MODELO`); custo de centavos por mês.
- Regras do conversor de números (`numeros-por-extenso.ts`): "um/uma" sozinho nunca vira 1;
  número até dez sozinho só vira dígito colado em "reais"/"mil" (em "dois cafés dezoito reais",
  o dois é quantidade); centavos só com a palavra "centavos".

## Perguntar quanto gastou (grupo financeiro e privado)

Pergunta livre, respondida com o que foi lançado — soma da empresa e do pessoal:

| Pergunta | Resposta |
|---|---|
| `quanto gastei de uber com o igor esse mês?` | soma dos lançamentos que têm **uber e igor** na descrição/categoria, com a lista |
| `quanto gastei com mercado?` | esse mês é o padrão |
| `quanto gastei de uber mês passado / em setembro / hoje / ontem / essa semana / semana passada / nos últimos 7 dias / esse ano / no total?` | o período pedido |
| `quanto gastei com alimentação?` | por categoria também |
| `quanto gastei de mercado pessoal?` | só o pessoal (ou `empresa`, `treinamentos`) |
| `quanto gastei esse mês?` | sem assunto: o resumo geral |

- Todos os termos precisam aparecer (uber **e** igor). Se não há nenhum com os dois, o robô mostra o que
  existe de cada um separado.
- O robô só liga "Igor" ao Uber se o nome estiver na **descrição**: escreva `uber 23 igor`.
- Responde sem IA (conta de dinheiro por regra), também no **privado** — só para quem vê o Financeiro (ADMIN),
  e o pessoal somado é sempre o de quem pergunta.

## A regra de empresa × pessoal (decisão do Guilherme)

"Sempre sai da empresa; quando for pessoal eu aviso. Na dúvida, pergunta."

1. Disse "pessoal"/"particular"/"pra casa" → pessoal.
2. Disse "empresa"/"agência"/"treinamentos" → empresa.
3. Não disse, e é coisa de empresa ou serve pros dois (software, imposto, almoço, gasolina, uber) → empresa.
4. Não disse, e é típico da vida pessoal (mercado, farmácia, roupa, lazer, IPVA) → **pergunta**.

A pergunta não vence: fica até a resposta, e dúvidas de várias mensagens viram uma pergunta só, numerada.

## Como a leitura funciona

- Primeiro por regra (`src/lib/financeiro-ia/interpretar-gasto.ts`, arquivo puro e testado):
  valores ("45", "45,90", "1.200", "1,5 mil", "R$ 80"), datas, categorias por palavra.
- O que a regra não resolve (categoria desconhecida, dois números como "2 cafés 18") vai pra IA
  (`ler-com-ia.ts`). A IA só diz o que a frase disse e pra que lado a coisa pende; a decisão de
  perguntar passa pela MESMA regra.
- Sem IA: categoria desconhecida entra como "Outros" e pergunta o destino; dois números pede pra reescrever.

## Onde aparece

- **Financeiro → Gastos da empresa**: por categoria (barras com %), últimos 6 meses, lançamentos.
- **Financeiro → Pessoal**: o mesmo, dos gastos pessoais — **só do usuário logado** (trava na consulta).
- **DRE**: "(−) Retiradas pessoais" e "(=) Ficou na empresa", DEPOIS do lucro (retirada não é custo).
- **DFC**: retiradas contam como saída de caixa ("Retiradas").

## Próxima fase (passo 2)

Alertas e ideias: gasto fora do padrão do mês, categoria que estourou a média, retirada acima do
lucro, imposto perto do vencimento, resumo semanal no grupo.
