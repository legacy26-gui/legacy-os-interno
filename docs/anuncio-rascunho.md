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
