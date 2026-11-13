# Legacy Studio

A produção de arte das lojas feita pelo sistema, com revisão de gente no fim.

Hoje cada peça é montada à mão num editor de imagem a partir da foto que a
loja mandou — mesma moldura, mesmo preço, mesma logo, trinta vezes por
semana. O Studio troca isso por: foto + dados do carro → feed e Stories
prontos, com a identidade da loja.

## A decisão que manda em tudo: a arte não é guardada

Guarda-se a **foto do carro** e os **dados do veículo**. Os dois PNGs são
desenhados na hora em que alguém abre ou baixa.

É a mesma escolha do relatório do cliente, pelos mesmos motivos e mais um:

- **Espaço.** Guardar feed + Stories triplicaria o peso por anúncio.
- **A arte é função dos dados, não um arquivo.** No dia em que a loja trocar
  de logo, as artes antigas continuariam com a cara velha se fossem arquivos
  — e alguém teria que achar e refazer uma a uma. Desenhando na hora, trocar
  a logo conserta o acervo inteiro.

É por isso que a tela diz, na peça: *"trocar a logo da loja atualiza todas as
artes dela de uma vez"*. Não é promessa de marketing; é como funciona.

## A identidade de cada loja

`/studio/marcas` — uma linha por loja: logo, três cores e o rodapé
(telefone e endereço).

- **A logo é guardada como PNG, não JPEG.** Ela vai em cima da foto de um
  carro: achatada pra JPEG, chegaria com o próprio retângulo de fundo — um
  quadrado branco ou preto no canto, que é a cara de peça feita às pressas.
  A foto do carro, essa vira JPEG, porque não tem transparência a preservar
  e pesa um terço.
- **Sem marca cadastrada a arte sai assim mesmo**, com as cores padrão e o
  nome da loja em letra. Nunca uma logo inventada: logo mal-feita parece
  falsificação.

## O que o sistema faz com a foto antes de guardar

Três coisas, nesta ordem, em `src/lib/studio/arte.ts`:

1. **Aplica a orientação do EXIF** (`rotate()` sem argumento). Sem isso, foto
   tirada de pé chega deitada.
2. **Reduz pra 1600px no maior lado** e converte pra JPEG 82. O celular manda
   4000px e 8MB; na arte ela aparece com 1080. Todo o resto é peso no banco,
   no backup e na memória da função.
3. **Apaga os metadados.** Foto de celular carrega GPS. Ela vai pro banco e,
   pela arte, pro Instagram da loja — mandar junto a coordenada do pátio (ou
   da casa de quem fotografou) é vazamento que ninguém pediu.

## A esteira

```
PRONTO  →  APROVADO
   ↓  ↑
CORRIGIR
```

Três estados, e não dois, porque "pronto" e "aprovado" são coisas
diferentes: a máquina termina, mas quem responde pelo que vai ao ar é gente.

- **Quem produz:** ADMIN, GERENTE e GESTOR_TRAFEGO. O gestor entra porque é
  ele que está com a loja no telefone quando o carro chega — fazer a arte
  depender de outra pessoa é o que faz o anúncio sair dois dias depois.
- **Quem aprova e pede correção:** só a direção.
- **O motivo da correção é obrigatório.** "Reprovado" sem texto devolve a
  peça sem dizer o que mudar, e o resultado é a mesma peça voltando igual.
- **Mexer nos dados devolve a peça pra fila.** Aprovação não se herda: o que
  foi aprovado era o que estava escrito antes.
- **Arrumar os dados fecha a esteira.** Antes dava pra PEDIR correção e não
  dava pra FAZER: a única saída seria apagar e criar de novo, reanexando a
  foto. Na prática ninguém faria, e o pedido viraria um recado parado na
  tela. A foto não se troca ali de propósito — foto errada é outra arte, não
  uma correção.
- Quem aprovou e quando ficam guardados. Quando uma arte errada for ao ar —
  e uma vai —, a pergunta vai ser "quem olhou isso".

## Dois erros que só apareceram ao gerar a imagem de verdade

Ficam registrados porque os dois são invisíveis em código:

**O preço cortado pela barra do rodapé.** A barra é posicionada por cima de
tudo; o bloco de informação não reservava a altura dela. A primeira arte saiu
com "R$ 89.900" pela metade. Não dá erro nenhum: a imagem sai, com 200 KB,
bonita na miniatura.

**A emenda no Stories.** Ali a foto ocupa os 62% de cima e o resto é fundo
chapado. O degradê não chegava opaco onde a foto acabava, e aparecia uma
linha horizontal atravessando a peça. Agora a conta é feita a partir do fim
da foto, não chutada.

## Escrito pensando no Copiloto

O Legacy Control vai ter um copiloto de IA, e o Studio precisa poder ser
comandado por ele. Por isso **cada operação em `src/lib/actions/studio.ts`
recebe dados e devolve resultado**, sem depender de FormData nem de nada que
só exista num navegador:

```
a tela de hoje    → o formulário chama
o copiloto amanhã → a IA chama com os campos que extraiu da conversa
um robô qualquer  → chama direto
```

A trava de permissão mora **dentro** de cada função, não na tela. É isso que
faz o copiloto não virar um buraco: se amanhã ele chamar `aprovarArte` em
nome de alguém, a conferência de carteira acontece igual.

## Os três desenhos

Cada loja escolhe o seu em `/studio/marcas`:

| Desenho | O que é |
|---|---|
| **Degradê** | Foto sangrando na arte inteira, informação sobre um degradê no pé. O mais sóbrio. |
| **Faixa** | Foto em cima, bloco de cor chapada embaixo, separados por um fio da cor da marca. O mais legível, e o mais comum em loja de carro. |
| **Etiqueta** | Foto inteira com o preço numa placa grande à direita. O mais agressivo, pra oferta. |

**Três desenhos inteiros, e não um com muitas opções.** A diferença importa:
opção solta ("logo à esquerda?", "preço grande?") multiplica combinações que
ninguém testou, e metade sai feia. Três desenhos pensados até o fim é o que
uma loja escolhe em dez segundos.

A coluna é texto e não enum pelo mesmo motivo dos tipos de alerta: desenho
novo entra sem migração, e desenho que sair de cena faz as lojas caírem no
padrão sozinhas, em vez de ficarem com a arte quebrada até alguém rodar uma
migração.

No "etiqueta" o preço **não** aparece também no bloco de informação. Repetir
o mesmo número duas vezes na mesma peça é o erro clássico de arte gerada.

Os três ainda não são os layouts da Legacy — são três bons desenhos
genéricos. Pra reproduzir o padrão da casa eu preciso ver duas ou três artes
reais que a equipe já faz.

## O que ainda não existe

**Vídeo.** Não cabe onde o sistema mora. Ver a seção abaixo.

## Por que o editor de vídeo não entrou

Não é falta de tempo: **não roda na Vercel.** O que a edição automática
exige, e o que a plataforma oferece:

| Precisa | A Vercel dá |
|---|---|
| ffmpeg rodando minutos por vídeo | função morre em 300s |
| arquivo de centenas de MB subindo | limite de alguns MB por requisição |
| disco pra trabalhar o arquivo | sistema de arquivos temporário e pequeno |
| guardar o bruto e o editado | nenhum armazenamento de objeto |
| transcrever pra legendar | nenhum |

Três caminhos, e nenhum é "escrever mais código neste repositório":

1. **API de edição pronta** (Shotstack, Creatomate e parecidas). Mais rápido
   de ligar, cobrado por minuto de vídeo, e o padrão de edição fica limitado
   ao que elas sabem fazer.
2. **Um trabalhador próprio** (Railway, Fly, uma máquina) com ffmpeg, mais
   armazenamento de objeto (R2, S3) e uma fila. Mais trabalho, controle
   total, mais barato em volume.
3. **Transcrição à parte** pra legenda sincronizada — Whisper ou equivalente
   —, que é independente dos dois acima.

A escolha é de custo e de operação, não de código, e por isso está aqui em
vez de virar uma tela que não funciona.
