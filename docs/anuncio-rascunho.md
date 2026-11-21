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
escolhido vira **molde** e a Meta o duplica (`/{conjunto}/copies`, só o conjunto, sem os anúncios de dentro).

- O conjunto novo nasce **PAUSADO**, com o **nome do carro** e o **orçamento diário** informado (padrão: o do molde).
  Público, localização, otimização e o resto ficam iguais ao molde.
- O anúncio é criado dentro do conjunto novo, também pausado. Pra publicar: **ligar o conjunto e o anúncio**.
- Orçamento aceito: R$ 1 a R$ 1.000/dia. Se a campanha controla o orçamento (orçamento na campanha) ou o molde usa
  orçamento total, o sistema **não mexe** no orçamento e avisa.
- O anúncio-base é conferido **antes** de duplicar (não sobra conjunto vazio por causa de base de vídeo/Advantage+).
- Se o conjunto foi criado e o anúncio falhou depois, a próxima tentativa **sobe no mesmo conjunto** (não cria outro).
- O "mesmo de sempre" da loja (`padrao_de_rascunho`) passa a lembrar **se é um carro por conjunto** e o **orçamento**:
  o próximo carro já vem assim, na tela e no WhatsApp.
- O conjunto criado fica no histórico (`meta_acoes`, nível conjunto) e na lista "Rascunhos recentes" com link pro Gerenciador.

**Na tela:** passo 1 → "Criar um conjunto novo, duplicando este (um carro por conjunto)", nome e orçamento diário.
**No WhatsApp:** no resumo, `conjunto novo` (ou `mesmo conjunto` pra voltar), `orçamento: 12`.

Testes: `t-rascunho.mjs` (seções 8 e 9), `t-subir-whats.mjs` (seção 7b), `dup-tela.mjs` (navegador).
