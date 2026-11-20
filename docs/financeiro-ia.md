# Financeiro pela IA — o grupo de gastos

O Guilherme anota **cada gasto** num grupo de WhatsApp só dele ("financeiro (gastos)") e o robô
lança no financeiro: gasto da empresa vai pro DRE; gasto pessoal vira **retirada**.

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
