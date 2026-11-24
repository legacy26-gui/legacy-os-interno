# Subir anúncio como rascunho (duplica um anúncio da loja, gestor publica)

**Onde:** Meta Ads → uma loja → botão **Subir anúncio** (`/meta-ads/<loja>/subir-anuncio`).

O gestor escolhe a campanha e o conjunto, aponta **um anúncio que a loja já roda** pra duplicar, manda as
fotos do designer e a legenda. O sistema copia do anúncio-base o que não muda de carro pra carro (página
que assina, Instagram, botão, rastreamento/pixel, parâmetros de URL, melhorias de criativo) e troca só o que
é do carro: **fotos, legenda, título e, se o gestor quiser, o link**. O anúncio nasce **PAUSADO**. O gestor
confere no Gerenciador e publica. Criar anúncio do zero continua sendo no Gerenciador (se der, no futuro,
fazemos pelo nosso sistema).

## Regras (não mudam)

1. O anúncio sempre nasce **pausado**. Não há caminho no código que ative.
2. Conjunto **e** anúncio-base precisam ser de contas da loja, pelo cadastro local (`acharObjetoDaLoja`),
   como em toda escrita na Meta. Id trocado no navegador não vira anúncio em conta de outro cliente.
3. **Orçamento e localização ficam no conjunto**: o sistema só **lê** e avisa, nunca altera. "Sugere, eu decido."
4. Só duplica anúncio de **foto ou carrossel de imagem**. Vídeo, Advantage+ (várias legendas) e anúncio que
   usa um post já existente são recusados, com o motivo, na hora em que o base é escolhido.
5. **O link só muda se o gestor mudar.** Anúncio que leva pro WhatsApp continua levando pro WhatsApp (o link
   do botão só é trocado quando o link do anúncio mudou).
6. Foto única vira foto; duas ou mais viram carrossel (ordem da tela = ordem do carrossel, até 10).
7. Quem usa: o gestor **das lojas dele** (carteira) e a direção. Loja de outro gestor dá 404.

## A tela (`formulario.tsx`)

1. **Onde:** campanha → conjunto. Mostra o orçamento do conjunto e a sugestão pelo investimento da loja (÷ 30).
2. **Qual duplicar:** lista os anúncios da loja (os do próprio conjunto primeiro). Ao escolher, lê o base na Meta
   e diz se dá pra duplicar. A legenda dele fica à parte ("é de outro carro"); o campo da legenda começa **vazio**.
3. **O carro:** opcional, escolhe do estoque do site (preenche dados, nome e título; botão "usar a página do carro
   no site" troca o link). Sem estoque, digita os dados.
4. **Fotos:** reduzidas **no navegador** (lado maior 1.440 px, JPEG) e enviadas **uma por vez** — a hospedagem não
   aceita pedido grande, e se a 5ª falhar as 4 primeiras não repetem. Avisa foto abaixo de 600 px.
5. **Legenda:** à mão, ou **Escrever com IA** (ver abaixo). Sempre num campo editável.
6. **Subir:** só libera com tudo preenchido; diz o que falta. Depois de criado: "Anúncio criado — PAUSADO", os
   avisos e o link pro Gerenciador. Foto e legenda são limpas; campanha, conjunto e base ficam pro próximo carro.

Abaixo, **Rascunhos recentes**: nome, quando, quem, estado de hoje (se a varredura já viu o anúncio; "Pausado
(criado por aqui)" antes disso) e o link pro Gerenciador na conta certa.

## Legenda pela IA (`legenda-do-rascunho.ts`)

- Recebe os **dados do carro** (digitados ou do estoque) e até 3 legendas da própria loja (a do anúncio-base
  primeiro) pra copiar a voz, a estrutura, os emojis e o rodapé.
- Só usa fato dos dados. **Conferência em código:** valor em reais na legenda que não esteja nos dados do carro vira
  **aviso vermelho** na tela ("cita R$ 59.900 e esse valor não está nos dados do carro"). A IA não publica nada.
- Exemplos e dados vão pro modelo marcados como dados, nunca como instrução.
- Sem IA configurada ou com falha: mensagem clara, e a pessoa escreve na mão.

## Avisos que o gestor vê

- conjunto anuncia em outra cidade que não a da loja; ou sem cidade na segmentação (só raio);
- orçamento do conjunto muito diferente do investimento previsto da loja (só aviso);
- conjunto **pausado** (o anúncio só roda quando o conjunto também for ligado);
- não deu pra ler a localização do conjunto (a criação segue, com aviso).

## Código

- `src/lib/meta/rascunho-anuncio.ts` — `lerBaseDoAnuncio`, `montarSpecDoRascunho` (pura), `subirFotoDoRascunho`,
  `criarRascunhoDeAnuncio`. Registra em `meta_acoes` (`origem: criacao-rascunho`, com a conta Meta).
- `src/lib/actions/rascunho.ts` — ações da tela (conferem permissão e carteira antes de tudo).
- `src/lib/meta/legenda-do-rascunho.ts` — a legenda.
- Testes: `t-rascunho.mjs` (núcleo, Meta falsa), `t-legenda.mjs`, `rasc-tela.mjs` (navegador, fotos reais).

## Falta conferir com a Meta de verdade

Tudo foi testado contra uma Meta de mentira. Na primeira vez real: confirmar que o token de **escrita** tem
`ads_management` (Configurações já mostra) e conferir no Gerenciador que o anúncio duplicado ficou igual ao base
(página, botão, pixel). Se algum campo do criativo do base não for aceito pela Meta, o erro dela aparece na tela.

---

# Subir pelo WhatsApp (privado do robô)

A pessoa manda as fotos pro robô **no privado** e o robô monta o mesmo rascunho da tela. Mesmas regras: sempre
**PAUSADO**, mesmas travas de cadastro, só as lojas da carteira dela, e o robô **só age com um "sim"**.

## A conversa

```
📷 (manda 3 fotos)              → "Recebi a foto. Manda as outras e me diz a loja e o carro, ex.: virtus 2021 r2"
virtus 2021 r2                  → em qual conjunto? (lista numerada)  — só na 1ª vez da loja
2                               → resumo: loja, conjunto, anúncio que vai duplicar, fotos (foto única/carrossel),
                                  carro (completado pelo estoque do site), título, LEGENDA da IA e avisos
legenda: …  /  título: …  /  carro: …  /  conjunto  /  base  /  loja     → trocam e mostram o resumo de novo
sim                             → sobe as fotos, duplica o base PAUSADO e manda o link do Gerenciador
```

- **Foto com texto junto** (a legenda da foto) vale como a mensagem: `civic 2018` + foto já abre a conversa.
- **"Mesmo de sempre"**: depois do primeiro anúncio de uma loja, o robô lembra o conjunto e o anúncio-base
  (`padrao_de_rascunho`) e propõe os mesmos. Pra trocar: `conjunto` ou `base`.
- Só fala a loja se a pessoa tem mais de uma; gestora com uma loja só nunca é perguntada.
- O anúncio-base é escolhido sozinho: o 1º do conjunto que dá pra duplicar (foto/carrossel); se nenhum serve, o
  robô mostra a lista e o motivo.
- **Ordem do carrossel** = a ordem em que as fotos foram mandadas (horário da Z-API, mesmo que cheguem trocadas).
- Álbum: o robô responde **uma vez** só (na 1ª foto); as outras entram em silêncio.
- `cancela` sai a qualquer hora e apaga as fotos. A conversa **vence em 30 min** sem resposta; a varredura de
  15 em 15 min limpa conversas vencidas e fotos órfãs.
- Começar com texto também vale: `subir anúncio` → o robô pede as fotos. ("sobe a verba…" não conta.)

## As travas

1. **Antes de baixar a foto:** o número tem que ser de pessoa da casa com acesso a clientes, e o acesso de escrita
   na Meta tem que existir. Número desconhecido e foto de **grupo** (de cliente) são ignorados sem baixar nada.
2. **Download seguro:** só https (sem IP nem nome interno), no máximo 4 MB, 20 s, sem seguir redirecionamento, e o
   conteúdo precisa ser JPEG ou PNG de verdade (confere os bytes).
3. O mesmo `messageId` reenviado pela Z-API não guarda a foto duas vezes; o "sim" duplicado não sobe duas vezes.
4. Quem executa é o mesmo núcleo da tela (`criarRascunhoDeAnuncio`); este caminho não tem acesso próprio à Meta.
5. Os valores da legenda são conferidos em código (preço que não está nos dados vira ⚠️ no resumo).
6. O registro (`meta_acoes`) fica com o nome de quem pediu, "(WhatsApp)".

## Limites que vale saber

- O WhatsApp **comprime** a foto mandada como "foto" (costuma ficar abaixo de 1 MB). Pra arte do designer com
  qualidade total, use a tela (Meta Ads → Subir anúncio). Arquivo mandado como "documento" não é lido.
- Anúncio de vídeo, Advantage+ e post existente não servem de base (a tela e o robô explicam o motivo).
- Depende da Z-API estar mandando as mensagens recebidas pro mesmo endereço do webhook (já é o caso do texto).

## Código

`src/lib/whatsapp/subir-anuncio.ts` (a conversa), `foto-recebida.ts` (download e travas), webhook
`src/app/api/whatsapp/recebido/[segredo]/route.ts` (aceita `image` no privado), tabelas `rascunhos_whatsapp`,
`rascunho_fotos`, `padrao_de_rascunho` (migração `20261123100000_rascunho_whatsapp`).
Testes: `t-subir-whats.mjs` (conversa inteira, Z-API e Meta falsas) e `t-subir-http.mjs` (o webhook de verdade).

---

# Um carro por conjunto (duplicar o CONJUNTO)

Lojas como a Vilela usam **um conjunto por carro**. Pra elas o anúncio não entra num conjunto que já existe: o conjunto
escolhido vira **molde** e a Meta copia **só o conjunto** (`/{conjunto}/copies` com `deep_copy=false`): público, localização, otimização e lance iguais, conferidos campo a campo contra o molde. O anúncio do carro novo é criado dentro do conjunto novo a partir do anúncio-base (mesma conferência de Advantage+ do modo normal). **Por que não a cópia completa:** a Meta recusa copiar anúncio que tem os "aprimoramentos padrão" antigos do Advantage+ ("O recurso de inclusão do campo de aprimoramentos padrão no criativo foi descontinuado. Defina recursos individuais."). Pelo mesmo motivo o criativo novo vai **sem** `standard_enhancements` (os recursos individuais do base continuam indo; o que a Meta ligar a mais é desligado, ou o anúncio não sobe). **Janela de atribuição que não vale mais:** quando a Meta recusa a cópia porque a atribuição do molde não é aceita pro objetivo ("use uma destas janelas compatíveis: 1 dias"), o sistema lê as janelas aceitas do próprio erro e CRIA o conjunto (`/act_X/adsets`, pausado) com os campos lidos do molde, trocando só a janela de clique pela compatível mais próxima (se ainda assim recusar, vai sem atribuição: a padrão da Meta). A conferência campo a campo ignora só a atribuição, e o aviso diz o que mudou (de → pra). **Molde com vários anúncios:** a tela e o WhatsApp avisam; o conjunto novo nasce só com o anúncio do carro novo. Se a Meta trouxer algum anúncio junto na cópia, ele é apagado ali (nunca um id do molde), com registro no histórico. Na tela e no WhatsApp, a lista de anúncio-base mostra só os anúncios do conjunto escolhido.

- O conjunto novo nasce **PAUSADO**, com o **nome do carro** e o **orçamento diário** informado (padrão: o do molde).
  Público, localização, otimização e o resto ficam iguais ao molde (a Meta copia).
- O anúncio que veio na cópia recebe o criativo do carro novo, pausado. Pra publicar: **ligar o conjunto e o anúncio**.
- Orçamento aceito: R$ 1 a R$ 1.000/dia. Se a campanha controla o orçamento (orçamento na campanha) ou o molde usa
  orçamento total, o sistema **não mexe** no orçamento e avisa.
- O anúncio-base é conferido **antes** de duplicar (não sobra conjunto vazio por causa de base de vídeo/Advantage+).
- Se o conjunto foi criado e o anúncio falhou depois, a próxima tentativa **sobe no mesmo conjunto** (não cria outro).
- O "mesmo de sempre" da loja (`padrao_de_rascunho`) passa a lembrar **se é um carro por conjunto** e o **orçamento**:
  o próximo carro já vem assim, na tela e no WhatsApp.
- O conjunto criado fica no histórico (`meta_acoes`, nível conjunto) e na lista "Rascunhos recentes" com link pro Gerenciador.

**Na tela:** passo 1 → "Duplicar este conjunto inteiro e trocar o anúncio pelo do carro novo (um carro por conjunto)", nome e orçamento diário.
**No WhatsApp:** no resumo, `conjunto novo` (ou `mesmo conjunto` pra voltar), `orçamento: 12`.

Testes: `t-rascunho.mjs` (seções 8, 9 e 12), `t-subir-whats.mjs` (seção 7b), `dup-tela.mjs` (navegador).

---

# Duplicação EXATA (nada de Advantage+ a mais)

Regra do Guilherme: duplicar **exatamente igual**, sem ligar nada do Advantage+ que o anúncio original não tinha.

O risco: criativo criado pela API pode ganhar da Meta, **por padrão**, aprimoramentos do Advantage+ (retoque de imagem,
variações de texto, música, comentário em destaque…) e os **anúncios com vários anunciantes**.

**Criativo** (`criarCriativoIgualAoBase`):
1. vai com as mesmas escolhas do base (`degrees_of_freedom_spec`) e com "vários anunciantes" igual ao base, ou
   **desligado** se o base não diz nada;
2. depois de criado, o sistema **relê na Meta** o que ela gravou e compara com o base;
3. recurso ligado a mais → cria de novo dizendo **desligado** pra cada um;
4. ainda ligado (ou não deu pra reler) → **o anúncio não sobe**, e a mensagem diz quais recursos. O criativo solto não gasta nada.
   O que o base já tinha ligado continua ligado (é cópia).

**Conjunto duplicado** (`conferirCopiaDoConjunto`): relê molde e cópia e compara público/segmentação (inclusive o
Advantage+ público), otimização, cobrança, estratégia e valor de lance, objeto promovido, destino, atribuição e criativo
dinâmico. Diferença → escreve na cópia o valor do molde e relê; se continuar diferente, **o anúncio não sobe** e o
conjunto (pausado, vazio) é apontado pra apagar. Nome e orçamento ficam de fora da comparação (mudam de propósito).

Testes: `t-rascunho.mjs` seções 10 e 11 (Meta falsa que liga recursos sozinha / muda o público da cópia).


## Anunciar agora: do estoque ao rascunho pausado (`src/lib/estoque/anunciar-agora.ts`)

Na **ficha de cada loja** (Clientes → a loja) tem a seção **Estoque no site**: cada carro lido do site da loja, com foto, ano, km,
cor, preço, a **comparação com a FIPE**, há quantos dias está no site e a **situação de anúncio** (`sem anúncio`, `N anúncios no ar`,
`rascunho criado`, ou `não deu pra confirmar anúncio` — a mesma ligação carro↔anúncio das Sugestões, só com certeza). Nos que não
têm anúncio aparece o botão **Anunciar agora** (também nos cartões de "Carro novo sem anúncio" das Sugestões). Sem site de estoque
ligado, a seção diz isso.

O botão abre uma **bolha por cima da tela** que já vem preenchida:
- **Fotos**: até **6** do site (dá pra tirar as que não quer; uma foto = foto única, duas ou mais = carrossel).
- **Campanha**: **existente** (lista as da loja) ou **nova**. Campanha nova é uma cópia **pausada** da campanha do conjunto
  molde (só a campanha, sem conjuntos nem anúncios), com o nome que você der.
- **Conjunto**: **existente** (os da campanha escolhida) ou **novo** (um por carro: cópia do conjunto molde, com o nome do carro
  e orçamento diário opcional). Em campanha nova o conjunto é sempre novo, criado dentro dela.
- **Copiar as configurações de**: o conjunto molde (público, localização, otimização) quando algo é novo, e o **anúncio-base**
  (de onde herda página, botão e rastreamento; foto ou carrossel).
- **Legenda**: escrita pela IA com a voz da loja, editável; avisos se citar valor que não está nos dados do carro.
O "mesmo de sempre" da loja (`padrao_de_rascunho`) vem já escolhido; sem ele, escolhe-se na hora.

**Travas**: tudo nasce **PAUSADO** (campanha, conjunto e anúncio) e nada é ligado; loja, campanha, conjunto e anúncio escolhidos
têm que ser da loja (conferido no servidor); as fotos só valem se estiverem na página do carro (endereço mandado pelo navegador
que a página não tem é ignorado); um rascunho por carro (`rascunhoAdId`; clique duplo não duplica); erro no meio vira frase e
libera o carro pra tentar de novo (e diz se uma campanha/conjunto já chegou a ser criado, pra apagar no Gerenciador).
**Atenção**: a criação de campanha nova foi testada contra uma Meta de mentira; a primeira vez de verdade vale conferir no Gerenciador.

Pelo WhatsApp continua existindo `anunciar o Compass da Vilela` (usa o "mesmo de sempre", mostra o que vai fazer e só faz no
"sim"). **Não há mais aviso automático de carro novo** — a pessoa vê o estoque na ficha da loja.
