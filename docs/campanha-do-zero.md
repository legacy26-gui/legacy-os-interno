# Campanha do zero (loja nova)

**Meta Ads → loja → "Campanha do zero"** (`/meta-ads/<loja>/campanha-do-zero`). Pra loja que ainda não tem campanha pra copiar:
cria **campanha → conjunto(s) → um anúncio por carro do estoque**, tudo **PAUSADO**, destino **mensagem no WhatsApp**
(decisão do Guilherme, 25/11/2026). Código: `src/lib/meta/campanha-do-zero.ts`, ações em `src/lib/actions/campanha-do-zero.ts`.

## O formulário
1. **Conta e página** — a conta de anúncio da loja e a página do Facebook (lista de `act_X/promote_pages`). O WhatsApp é o número
   ligado a essa página.
2. **Campanha, estrutura e orçamento** — nome; **um conjunto por carro** (nome do conjunto = nome do carro; combina com o robô,
   que pausa o conjunto), **um conjunto com todos**, ou **montar os conjuntos**: quantos quiser (até 50), cada um com nome e,
   quando o orçamento é por conjunto, o seu valor por dia (vazio = o valor padrão); em cada carro escolhe-se o conjunto. Conjunto
   sem carro não é criado; orçamento **por conjunto** (R$/dia cada) ou **na campanha** (a Meta divide).
   Mostra o total por dia. Mínimo R$ 6/dia.
3. **Público** — idade, gênero, cidades/estados com raio (busca da própria Meta). **Advantage+ público sempre desligado.**
4. **Carros** — o estoque lido do site (carro que já tem anúncio vem desmarcado e travado). Nome do anúncio editável; legenda
   escrita à mão ou pela IA (botão "Escrever legendas com IA", ou vazia = a IA escreve na hora). Fotos por anúncio: 1 a 6 (do
   site; 2+ vira carrossel).

"Criar tudo pausado" confirma o resumo e cria em passos: campanha e conjuntos, depois um carro por vez (cada um mostra ✓ ou o
erro). Um carro que falhar não derruba os outros. No fim: "N de M anúncios criados, pausados" e o link da campanha no Gerenciador.

## O que vai pra Meta
- Campanha: `OUTCOME_ENGAGEMENT`, PAUSED, sem categoria especial; orçamento na campanha (`daily_budget`) ou
  `is_adset_budget_sharing_enabled=false` quando o orçamento é dos conjuntos.
- Conjunto: PAUSED, `optimization_goal=CONVERSATIONS`, `billing_event=IMPRESSIONS`, `destination_type=WHATSAPP`,
  `promoted_object={page_id}`, targeting do formulário com `targeting_automation.advantage_audience=0`.
- Criativo: `link_data` com o botão `WHATSAPP_MESSAGE` (link `api.whatsapp.com/send`), imagem única ou carrossel; os
  **aprimoramentos automáticos desligados** (`degrees_of_freedom_spec` com OPT_OUT em cada um) e `contextual_multi_ads` OPT_OUT. Se
  a Meta recusar o nome de um aprimoramento, tira só ele e tenta de novo (até 6 vezes).
- Anúncio: PAUSED, no conjunto do carro. O carro fica marcado (`rascunhoAdId`): não cria dois anúncios pro mesmo carro.

## Travas
Loja da carteira de quem cria; conta, carros e página conferidos no servidor (página que a conta não usa = recusa).

## ⚠️ Testado contra uma Meta falsa
A primeira criação de verdade deve ser conferida no Gerenciador (objetivo, WhatsApp, público, aprimoramentos desligados) antes
de ligar. Se a Meta recusar algum campo, a mensagem dela aparece na linha do carro ou no topo.

## Objetivo e modelo de conversa

- **Objetivo**: escolhido na tela — **Leads** (padrão, `OUTCOME_LEADS`) ou **Engajamento** (`OUTCOME_ENGAGEMENT`). Nos dois, o local da conversão é só o WhatsApp (`destination_type=WHATSAPP`).
- Meta de desempenho do conjunto: `CONVERSATIONS`. Se a Meta recusar essa meta numa campanha de Leads, o sistema tenta `LEAD_GENERATION` uma vez, usa a que funcionou nos próximos conjuntos e avisa.
- **Modelo de conversa** (no criativo, `link_data.page_welcome_message`): mensagem de boas-vindas (padrão "Oi! Como podemos ajudar?") e mensagem pronta (padrão "Olá! Posso ter mais informações sobre o {carro}?"). `{carro}` vira o nome de cada carro. Se a Meta recusar o modelo, o anúncio é criado sem ele e a tela avisa pra pôr no Gerenciador.
- Testado só contra uma Meta falsa: o formato exato que a Meta aceita precisa ser confirmado no primeiro teste real.

## Rodapé da legenda (endereço e WhatsApp)

Loja nova não tem legendas antigas pra IA copiar, e a legenda saía genérica. Agora:
- A tela mostra **"Rodapé da legenda"**, já preenchido com o que o site da loja mostra (link wa.me, dados estruturados, link tel:, endereço com número na página). Ver `src/lib/estoque/contato-puro.ts`.
- A pessoa confere/edita; ao escrever as legendas, o rodapé fica **salvo pra loja** (`estoque_da_loja.rodapeDaLegenda`) e passa a valer também no "anunciar agora".
- A IA termina cada legenda com esse rodapé, exatamente com aqueles dados. Sem rodapé e sem exemplos, ela não inventa endereço nem telefone.
- Testado nos sites: R2 (achou endereço e telefone fixo, sem WhatsApp no site), 7 Point, Bom Jesus (tem 2 endereços: pegou o 1º), DS.

## Legenda: três jeitos
- **IA escreve (pode editar)** — padrão: legenda vazia é escrita pela IA (com o rodapé da loja).
- **Eu escrevo a de cada carro** — a IA não entra; não cria nada enquanto faltar legenda em algum carro marcado.
- **Uma legenda pra todos** — um texto só; `{carro} {ano} {km} {cor} {preco} {rodape}` viram os dados de cada carro (linha sem dado some). A tela mostra a prévia de cada carro. Sem IA. Código: `src/lib/meta/legenda-modelo.ts`.

## Página do Facebook (sem trava)
- A lista vem de `promote_pages` (páginas que a conta pode promover). Ela pode vir vazia mesmo a loja tendo página (o acesso do sistema não enxerga a página, ou a página não está ligada à conta no Gerenciador de Negócios). Aí o sistema procura a página nos **anúncios que a conta já tem** (`effective_object_story_id` = `PAGINA_POST`; primeiro os sincronizados, depois `act_X/adcreatives`), a mais usada primeiro.
- Opções extras: **Outra página (colar o ID)** — aceita o ID ou link com `id=`; e **Sem página (termino no Gerenciador)**.
- Página fora da lista da conta: cria mesmo assim, com aviso (antes recusava).
- Sem página: a Meta não cria anúncio (o criativo exige `page_id`). O sistema cria campanha + conjuntos (sem `promoted_object`) e sobe as fotos de cada carro (arte na frente) pra biblioteca de imagens da conta.
