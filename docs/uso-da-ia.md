# Uso e custo da IA

## Onde ver
**Configurações → Uso da IA** (só a direção): quanto cada função gastou hoje, em 7 e em 30 dias — chamadas, tokens, custo
**estimado** em dólar pelo preço de tabela. A fatura real é a do painel da OpenAI; o que a tela dá e o painel não dá é **qual
função pesa**. Cada chamada vira uma linha em `uso_da_ia` (`src/lib/ai/uso.ts`, gravada por `gerarJson` e pela transcrição).
O registro começou em 24/11/2026: antes disso não há como separar por função.

## Por que estava caro
Toda chamada usava o modelo principal (gpt-5) com raciocínio "médio" e teto de 8.000 tokens — inclusive pra entender
"almoço 45". O raciocínio é cobrado como saída, que é a parte cara.

## O que mudou (24/11/2026)
| Função | Antes | Agora |
|---|---|---|
| Grupo financeiro: gasto simples ("almoço 45", "uber 23,50 pessoal") | IA | **sem IA** (regras), quando as regras leem a mensagem inteira com certeza e não há pergunta aberta nem palavra de outra ação (paguei, falta, vence, saldo, quanto, corrige, recebi…) |
| Grupo financeiro: o resto | gpt-5 médio | **gpt-5-mini, raciocínio baixo** |
| Copiloto: escolher a consulta | gpt-5 médio | **gpt-5-mini, raciocínio baixo** |
| Copiloto: escrever a resposta | gpt-5 médio | gpt-5, **raciocínio baixo** |
| Legenda do anúncio, comentário do relatório | gpt-5 médio | **gpt-5-mini, raciocínio baixo** |
| Diagnóstico da loja (raro, pesado) | gpt-5 médio | igual |
| Lista de carros ativos, alertas, saldo, lista de gastos | já sem IA | sem IA |

gpt-5-mini custa ~1/5 do gpt-5 (US$ 0,25/2 por 1M de entrada/saída contra 1,25/10). Se o modelo barato for recusado pela conta
(404/403/400), a chamada **volta sozinha** pro principal. Variáveis: `AI_MODELO_SIMPLES` (troca o barato),
`AI_ESFORCO_RESPOSTA` (low/medium pra resposta do copiloto), `AI_PRECO_*` (preços da estimativa).
