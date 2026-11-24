# Estoque das lojas (lido do site)

O sistema lê o estoque do site de cada loja **duas vezes por dia (9h e 15h de Brasília)** e guarda cada
carro com a data em que apareceu. Serve à **inteligência comercial** (há quantos dias o carro está parado,
o que entrou, o que saiu do site). **O preço de venda continua vindo do anúncio**, não daqui: o preço do
site é só informativo (e guardado no histórico, pra comparar).

## Ligar uma loja

Menu **Inteligência Comercial** → aba **Estoque** → "Lojas sem site ligado" → colar o endereço do site (ex.: `https://r2multimarcas.com.br`)
→ **Ligar site**. Só o administrador liga. O sistema confere que é AutoCerto **antes de gravar** e já faz a
primeira leitura (e deixa claro quantos carros achou). Tem **Ler agora** e **Desligar leitura** em cada loja.

Na tela **Estoque**, cada loja é uma caixa que **abre e fecha clicando no título** (com uma loja só já vem aberta; com várias,
fechadas, mostrando o resumo: quantos no ar e quando foi lido).

## Por que dá pra ler com segurança (AutoCerto)

Todo site feito no AutoCerto tem o mesmo molde: `/Veiculos` lista os carros (e anuncia o total) e cada
`/Veiculo/<nome>/<código>/detalhes` traz os dados num bloco estruturado (JSON-LD, o formato que o Google lê):
marca, modelo, ano, km, cor, preço. Não depende de cor ou layout do site, que a loja muda quando quer.
Uma integração serve todas as lojas AutoCerto. Outro sistema de estoque = um leitor novo
(`src/lib/estoque/`), com o mesmo desenho.

## Leve de propósito

Por loja, a cada leitura: **1 página de lista** + a página dos carros **novos** + um **rodízio de 12** dos
carros com a leitura mais antiga (pra renovar o preço). Uma requisição por vez, com pausa de 0,35 s e
identificando o sistema (`LegacyOS-estoque`). Passada geral com limite de tempo; o que não deu tempo é o
primeiro da próxima. Poucas centenas de requisições por dia para 50 lojas.

## Segundo tipo de site: catálogo (ex.: 7pointmotors.com) — `src/lib/estoque/site-catalogo.ts`

Sites de "app" que entregam a página **/estoque** com os carros **embutidos** no HTML (`{id, brand, model, version, year_fab,
year_model, price, mileage, color, is_available, car_images}`). Uma requisição traz o estoque inteiro com todos os dados: cada carro é
gravado a cada leitura (preço sempre fresco), sem abrir página de carro. `is_available: false` fica de fora. Preço vem em reais
inteiros. O "Ligar site" testa os dois tipos e grava `sistema` = `autocerto` ou `catalogo`; site de outro sistema recebe "ainda não
sei ler esse site, me manda o endereço".

**Fotos:** o link de cada foto é **assinado e expira em ~1 h**, e muda a cada visita. Por isso a foto não é guardada; no "anunciar
agora" ela é lida de novo da página do carro (`/veiculo/<id>`, só as da pasta `car-images/<id>/`), e a foto escolhida é comparada
**sem a parte depois do "?"**. Foto WebP, ou JPEG/PNG acima de 4 MB (a 7 Point manda PNG de ~3,4 MB), vira JPEG de até 2048 px.

## Terceiro tipo: site com API de veículos (ex.: bomjesusautomoveis.com) — `src/lib/estoque/site-api.ts`

Sites que têm a lista pública em JSON: **GET /api/vehicles** traz o estoque inteiro (`id, slug, marca, modelo, versao,
anoFabricacao, anoModelo, preco` em reais`, quilometragem, cor, fotos[]`), e **GET /api/vehicles/<slug>** traz um carro. A página do
carro (`/veiculo/<slug>`) é montada no navegador e não tem foto no HTML: o "anunciar agora" pega as fotos do JSON do carro. As
fotos ficam no servidor do AutoCerto (link fixo). `sistema` = `api`.

**Só a lista pública é lida.** O site da Bom Jesus também expõe em `/api/config` o token de integração do AutoCerto da loja: o
sistema **não usa** isso (é credencial da loja, exposta por engano no site dela) — vale avisar quem fez o site.

O "Ligar site" testa, nesta ordem: AutoCerto (`/Veiculos`), catálogo (`/estoque`), API (`/api/vehicles`).

## Carro que some da lista: só anota

Decisão do Guilherme: **não vira aviso** (muito carro sai do site por motivo que não é venda, e muito carro
nem está nos anúncios). O sistema só marca `sumiuEm`; se o carro volta, o campo volta a vazio. A data de
entrada nunca se perde.

## As travas contra leitura ruim (uma leitura ruim não pode "vender o estoque inteiro")

Nada é marcado como sumido quando: o site está fora do ar ou devolve erro; a página não parece AutoCerto
(manutenção com status 200); a lista veio vazia; a página **anuncia mais carros** do que trouxe; ou a lista
**encolhe pela metade de uma vez** (com 10+ carros conhecidos). A leitura seguinte decide. O erro da última
leitura aparece na tela da loja.

## Tabelas

`estoque_da_loja` (site, última leitura, último erro) · `estoque_carros` (um por carro, com `primeiraVezEm`,
`ultimaVezEm`, `sumiuEm`) · `estoque_precos` (uma linha só quando o preço do site MUDA).

## Limite

A contagem "há N dias no estoque" começa quando o sistema viu o carro pela primeira vez: o que já estava no
site no dia em que a leitura foi ligada aparece como "hoje". A idade real só vem com o tempo.

## Onde fica no sistema

Na aba **Inteligência Comercial** do menu (uma só), com abas por dentro: **Visão geral** (3 números do
mês: vendas por lead, loja que mais vendeu, carros no ar nos sites), **Estoque** (esta tela),
**Ranking de lojas** e **Controle de vendas** (as telas de sempre, nos endereços de sempre, agora com
as abas em cima). O **Marcar Venda** continua solto no menu: é tarefa do dia a dia. O menu enxuto do
gestor de tráfego não mudou. A Visão geral mostra só contagens, sem valor em reais.
