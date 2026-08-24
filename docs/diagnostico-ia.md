# Diagnóstico automático das fichas de novos clientes

Quando um cliente responde o formulário em `/formulario`, o sistema salva a
ficha e dispara sozinho a geração de um diagnóstico com IA. A equipe abre a
ficha (ou a página do cliente, depois que ela vira cadastro) e já encontra o
material pronto.

## Fluxo

1. Cliente envia o formulário → `submitOnboarding` grava a ficha.
2. Ainda na mesma requisição, mas **depois** da resposta ir pro cliente
   (`after()` do Next), roda `gerarDiagnostico`.
3. Uma linha nova é criada em `onboarding_analyses` com status `PROCESSANDO`.
4. `gerarJson` chama a IA impondo o formato de saída (structured output) e
   revalida a resposta com o mesmo schema.
5. Deu certo → status `CONCLUIDO` com o resultado. Deu errado → status `ERRO`
   com a mensagem. **A ficha do cliente é salva de qualquer jeito.**

Nada é sobrescrito: cada geração é uma versão nova. A tela mostra a última
versão concluída e avisa quando a última tentativa falhou.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/ai/config.ts` | Provedor, modelo e limites — tudo por variável de ambiente |
| `src/lib/ai/client.ts` | Única porta de saída pra IA (timeout, retry, validação) |
| `src/lib/ai/diagnostico-schema.ts` | Formato da resposta (Zod) — vale como contrato e como validação |
| `src/lib/ai/diagnostico-prompt.ts` | Prompt do analista + versão do prompt |
| `src/lib/ai/diagnostico.ts` | Orquestra: versiona, grava, trata erro |
| `src/lib/ai/enriquecimento.ts` | Etapa 2 (dados digitais) — estrutura pronta, coleta desligada |
| `src/components/diagnostico/` | Tela do diagnóstico |
| `src/app/api/diagnostico/gerar/route.ts` | Disparo manual e conferência da configuração |

## Variáveis de ambiente

Obrigatória: `ANTHROPIC_API_KEY`.

Opcionais (já têm padrão): `AI_PROVIDER`, `AI_MODEL`, `AI_EFFORT`,
`AI_MAX_TOKENS`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`. Ver `.env.example`.

Trocar de modelo é mudar `AI_MODEL`. Trocar de provedor exige implementar o
outro caminho em `src/lib/ai/client.ts` — o resto do sistema não muda.

## Trocar as perguntas ou o prompt

- Perguntas: `src/lib/onboarding-form.ts`.
- Prompt: `src/lib/ai/diagnostico-prompt.ts`. **Suba `PROMPT_VERSION`** ao mudar
  as instruções: a versão fica gravada em cada análise, então dá pra saber com
  que regra cada diagnóstico foi gerado.

## Etapa 2 — enriquecimento digital (o que falta pra ligar)

A estrutura está pronta (`ClientOnboarding.enrichment` + `enriquecimento.ts`);
falta credencial. Resumo do que cada fonte exige:

- **Instagram / Facebook**: Instagram Graph API e Facebook Graph API. Precisa da
  conta profissional do cliente ligada a uma página, autorização dele no
  Business Manager, app Meta com `instagram_basic` e `pages_read_engagement`
  aprovados em App Review, e token de longa duração por cliente.
- **Google / Perfil da empresa**: caminho rápido é a Places API (nota, total de
  avaliações e algumas avaliações públicas) — precisa de chave do Google Maps
  Platform com faturamento ativo. Caminho completo é a Google Business Profile
  API, que exige acesso concedido pelo cliente.
- **Site**: leitura simples da própria página do cliente (sem credencial),
  respeitando robots.txt; PageSpeed Insights API precisa de chave do Google.

Não fazemos scraping frágil ou contrário às regras das plataformas.

## Etapa 3 — reunião de onboarding

A ficha guarda `meetingNotes`. Com o resumo salvo, o botão "Gerar plano de ação
final" roda uma segunda análise (`kind = PLANO_FINAL`) que recebe o
pré-diagnóstico + o que foi dito na reunião e devolve, além do plano atualizado,
o campo `hipoteses_resolvidas` dizendo o que a conversa confirmou ou derrubou.

## Conferir e reprocessar sem abrir a tela

- `GET /api/diagnostico/gerar?key=SETUP_SECRET` → mostra provedor, modelo, se a
  chave está configurada, quantas fichas estão sem diagnóstico e as últimas
  análises.
- `POST /api/diagnostico/gerar?key=SETUP_SECRET&ficha=<id>` → gera de novo
  (acrescente `&tipo=final` para o plano de ação final).
