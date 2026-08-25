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

### Por que a geração roda em segundo plano

A função da Vercel morre em 60s e uma ficha respondida por inteiro leva mais que
isso (medimos 62s só de geração). Por isso, com a OpenAI o sistema **entrega o
trabalho** (`background: true`) e guarda o número do protocolo em
`providerJobId`; a tela do diagnóstico já se atualiza sozinha a cada 6s e, a
cada carregamento, o servidor pergunta ao provedor se ficou pronto e grava o
resultado. Trabalho que passa de 15 minutos sem terminar vira erro.

A Anthropic não tem esse modo: com `AI_PROVIDER=anthropic` a geração acontece
dentro da requisição e precisa caber no tempo da função.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/ai/config.ts` | Provedor, modelo e limites — tudo por variável de ambiente |
| `src/lib/ai/client.ts` | Única porta de saída pra IA (escolhe o provedor, timeout, retry, validação) |
| `src/lib/ai/provedores/openai.ts` | Adaptador da OpenAI (structured output em modo estrito) |
| `src/lib/ai/provedores/anthropic.ts` | Adaptador da Anthropic |
| `src/lib/ai/tipos.ts` | Contrato que os dois adaptadores cumprem |
| `src/lib/ai/diagnostico-schema.ts` | Formato da resposta (Zod) — vale como contrato e como validação |
| `src/lib/ai/diagnostico-prompt.ts` | Prompt do analista + versão do prompt |
| `src/lib/ai/diagnostico.ts` | Orquestra: versiona, grava, trata erro |
| `src/lib/ai/enriquecimento.ts` | Etapa 2 (dados digitais) — estrutura pronta, coleta desligada |
| `src/components/diagnostico/` | Tela do diagnóstico |
| `src/app/api/diagnostico/gerar/route.ts` | Disparo manual e conferência da configuração |

## Variáveis de ambiente

Dois provedores implementados: **OpenAI** e **Anthropic**. Escolha em
`AI_PROVIDER` e preencha só a chave correspondente:

| AI_PROVIDER | chave | modelo padrão |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | `gpt-5` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-5` |

Opcionais (já têm padrão): `AI_MODEL`, `AI_EFFORT` (só Anthropic),
`AI_MAX_TOKENS`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`. Ver `.env.example`.

Trocar de modelo ou de provedor é mudar variável de ambiente — nada de código.
Cada provedor vive em `src/lib/ai/provedores/`, com a mesma assinatura; para
somar um terceiro, basta implementar `chamar`, `descreve`, `retentavel` e
`modelos` e registrá-lo em `src/lib/ai/client.ts`.

Não sabe o nome exato do modelo? `GET /api/diagnostico/gerar?key=SETUP_SECRET&modelos=1`
lista os modelos que a conta configurada realmente tem.

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
