# A esteira de edição de vídeo

Corta as pausas e escreve a legenda no vídeo do pátio, sem ninguém abrir
editor.

Estado: **protótipo medido**, rodando fora do Legacy OS. O que está escrito
aqui foi executado, não projetado — menos onde diz o contrário.

```
vídeo bruto → corta o silêncio → transcreve → limpa → queima a legenda → pronto
```

## Como se roda

```bash
node scripts/video/editar.mjs patio.mp4 \
  --whisper /caminho/whisper.cpp/build/bin/whisper-cli \
  --modelo  /caminho/whisper.cpp/models/ggml-small.bin
```

Dá pra guardar os dois caminhos em `WHISPER_CLI` e `WHISPER_MODELO` e não
repetir. `--sem-legenda` e `--sem-corte` ligam e desligam cada metade.

O teste não precisa de whisper nenhum:

```bash
node scripts/video/editar.teste.mjs
```

## A ordem importa, e é o erro fácil de cometer

**Corta primeiro, transcreve depois.**

Ao contrário, a legenda sai do áudio original e os tempos dela não valem mais
nada depois do corte: cada pausa removida empurra a legenda pra frente, e o
erro acumula até a palavra aparecer segundos longe da boca. É defeito que não
aparece rodando o script e aparece no vídeo.

## O fôlego nas pontas do corte

O detector marca silêncio onde o som cai abaixo do limite, e isso acontece
DENTRO da palavra: o fim de "boa" e o começo de "tarde" são mais baixos que o
meio delas. Cortar exatamente ali come o começo e o fim de cada frase, e o
vídeo fica picado — parece erro de gravação, não de edição.

Por isso cada pausa devolve 0,15s pros dois vizinhos (`--sobra`).

| botão | padrão | o que faz |
|---|---|---|
| `--silencio` | -30 dB | abaixo disso é silêncio. -40 é mais tolerante |
| `--pausa` | 0,6 s | pausa menor que isso não é cortada |
| `--sobra` | 0,15 s | fôlego mantido nas pontas |

Pausa mínima existe porque tirar TODA pausa deixa a fala afobada. 0,6s tira a
hesitação e mantém a respiração.

## O que não é fala não pode queimar na tela

O Whisper não transcreve só fala: ele **anota** o que ouve. Rodando num apito
puro, devolveu `(bip)` três vezes, nos tempos exatos. Está certo, e é
exatamente o que não pode aparecer na tela. No pátio isso vira `(música)`,
`[Música]`, `(risos)`, `(ruído de motor)`.

Pior: em trecho sem fala o modelo às vezes **inventa**, e a invenção mais
conhecida dele é crédito de legendador — "Legendas pela comunidade
Amara.org". Queimado em cima do carro de um cliente.

Nada disso se conserta depois: a legenda está dentro da imagem. Então a
esteira limpa o `.srt` antes de queimar — tira os trechos que são só
anotação, tira o lixo conhecido, e nas linhas que têm fala **e** anotação
("(risos) e é automático") tira só a anotação.

Se não sobrar fala nenhuma, ele para e diz, em vez de entregar um vídeo sem
legenda sem explicação.

## Por que queimada, e não faixa de legenda

Instagram e TikTok ignoram faixa de legenda. O que não está na imagem não
existe lá.

O estilo é branco com contorno preto grosso, embaixo e no centro, `MarginV=60`
pra ficar acima dos botões do Reels. Lê em cima de carro escuro, de asfalto
claro e de céu estourado, sem precisar de tarja.

Os pedaços são curtos de propósito (`-ml 16 --split-on-word`): duas ou três
palavras trocando rápido, que é como legenda de Reels funciona. O padrão do
Whisper é frase inteira, que numa tela de celular vira parede de texto.

## O que foi medido

Nesta máquina (4 núcleos, sem placa de vídeo), modelo `small`:

| | |
|---|---|
| transcrição | **3,4x mais rápido que o tempo real** — 11s de áudio em 3,2s |
| esteira completa, vídeo de 12s | 4,5s de ponta a ponta |
| corte | 12s → 7,6s, tirando 4,4s de pausa, exatamente o previsto |
| legenda queimada | conferida no pixel: a faixa de baixo do quadro muda |

Um vídeo de 1 minuto transcreve em uns 18 segundos.

## O primeiro vídeo de verdade, e o que ele ensinou

13,7s de pátio: vendedor na frente de um L200 Sport 2005, plano único, som
com vento, `mean_volume` em -31 dB.

A frase era *"...uma camionete barata, custo acessível, 4x4, diesel. Vou
apresentar pra vocês essa linda L200 Sport 2005."*

| | o que saiu |
|---|---|
| `small` | "4x4 **Otizio**" |
| `small` + vocabulário | "4x4 **otíceo**" |
| `medium` | "4x4 **Tisio**" |
| **`medium` + vocabulário** | **"4x4, diesel."** |

**Nenhum dos dois sozinho acertou. É a combinação.** Trocar de modelo sem a
dica de vocabulário não resolveu, e a dica sem o modelo maior também não.

Por isso o vocabulário de loja está embutido (`VOCABULARIO_DA_LOJA`), e por
isso o padrão de trabalho é o `medium`. "Diesel" não é palavra qualquer:
aparece em quase todo vídeo de picape e de SUV, e ia queimada errada na tela.

Quando aparecer nome novo saindo errado, o lugar barato de consertar é
aquela lista — bem antes de pensar em trocar de modelo de novo.

O resto a `small` já acertava sozinha, inclusive a parte que parecia difícil:
"L200 Sport 2005", "camionete", "custo acessível", "4x4".

### O preço do medium

| | `small` | `medium` |
|---|---|---|
| tamanho | 487 MB | 1,5 GB |
| velocidade | 3,4x o tempo real | 1,35x o tempo real |
| vídeo de 1 min | ~18 s | ~45 s |

Esteira completa no vídeo de 13,7s, com `medium`: **14 segundos**, de ponta a
ponta, incluindo corte, transcrição, limpeza e queima.

## O que ainda NÃO foi provado

**Nenhum exemplo de edição foi medido ainda.** O estilo da legenda hoje é
escolha minha (branco, contorno preto, caixa normal, embaixo), não cópia de
referência nenhuma.

## Onde isto vai morar

Hoje: lugar nenhum fixo. Roda onde o ffmpeg e o whisper.cpp estiverem.

**Não dá pra pôr na Vercel**, e isso não é opinião:

- não existe `apt install` lá; só o que vai no pacote do deploy
- o Whisper local precisa de Python e PyTorch, uns 2,5 GB
- o tempo máximo de uma função é 5 min, e render de vertical de 60s leva de
  30s a 3min numa máquina de 2 núcleos — vídeo mais pesado estoura, e se paga
  o tempo todo de relógio
- `/tmp` tem 512 MB, e vídeo de celular de 1 minuto tem 150 a 300 MB

A Vercel pode **mandar** o trabalho; não pode **fazer**. Fazer pede uma
máquina sempre de pé (servidor próprio, ou um PC do escritório) e um lugar
pra guardar arquivo grande — decisão em aberto.
