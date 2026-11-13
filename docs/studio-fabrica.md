# A fábrica de artes do Legacy Studio

Protótipo medido em 13/11/2026 com a foto real da Saveiro Cross da Área 42
Motors. Tudo que está escrito aqui foi rodado, não projetado.

## O que a fábrica faz

```
foto real → diretor de arte → cena → composição → avaliação → correção → entrega
```

1. **Diretor de arte** (`gpt-4.1`) lê os dados do veículo e a identidade da
   loja e devolve três propostas em JSON: cenário, paleta, proporções,
   arranjo e frase de chamada.
2. **Cena** (`gpt-image-2`, endpoint de edição) recebe a FOTO REAL e o
   cenário descrito. Devolve o mesmo veículo num ambiente publicitário, com
   chão, sombra e luz coerentes.
3. **Composição** (sharp + Satori) aplica logo, modelo, ficha e preço por
   cima. Três formatos: 1:1, 4:5 e 9:16.
4. **Avaliação** (`gpt-4o`) compara a arte com a foto original e dá nota de 0
   a 10 em sete categorias, com parecer e lista de defeitos.
5. **Correção**: reprovou, o parecer volta pro diretor, que reescreve o
   plano. No máximo 3 tentativas.

## A regra de preço, que é o motivo da arquitetura

Nenhum dado passa pelo modelo de imagem. Preço, ano, quilometragem, modelo e
nome da loja são escritos na etapa 3, direto do cadastro.

Seria mais simples pedir a arte inteira pro modelo de imagem. Não dá: modelo
de imagem troca dígito. Um "R$ 74.900" que sai "R$ 74.990" é propaganda
enganosa publicada no nome da loja, e ninguém confere trinta artes com régua.
O JSON no meio custa liberdade criativa — o motor só desenha o que está no
esquema — e compra a garantia de que o número na arte é o número do cadastro.

## Por que a cena é editada, e não montada com recorte

A primeira arquitetura era recortar o carro e colar num fundo gerado. Morreu
na primeira foto real:

- **No pátio os carros ficam encostados.** O recortador fundiu a Saveiro com
  o carro de trás numa mancha só. Componente conexo não separou (é a mesma
  mancha), erosão até raio 36 não separou, e o modelo de visão acertou o lado
  mas não o pixel.
- **Recorte colado flutua.** Sem sombra e sem reflexo, denuncia montagem.
- **764 MB.** O `@imgly/background-removal-node` não cabe no limite de 250 MB
  de função da Vercel.

O modelo de imagem resolve os três de uma vez: sabe qual é o veículo do
anúncio, apaga o resto do pátio, e devolve chão com reflexo. E roda na Vercel,
porque é uma chamada HTTP.

**O custo dessa escolha, que precisa estar escrito:** o veículo é
REDESENHADO, não colado. Nos testes voltou fiel — placa OXJ7E38, adesivo
STETSOM, emblema CROSS, rodas, adesivos do para-brisa — e o avaliador deu 9 e
10 em fidelidade. Mas são pixels novos. Por isso a fidelidade é uma das notas,
comparada contra a foto original: é conferência, não confiança.

## Custo medido

Por 1 arte nos 3 formatos, sem correção:

| etapa | modelo | custo |
|---|---|---|
| direção de arte | gpt-4.1 | R$ 0,02 |
| cena 1:1 | gpt-image-2 | R$ 0,35 |
| cena retrato (serve 4:5 e 9:16) | gpt-image-2 | R$ 0,47 |
| avaliação | gpt-4o | R$ 0,06 |
| **total** | | **~R$ 0,90** |

Cada rodada de correção soma ~R$ 0,10 se só mexer no layout, ou ~R$ 0,45 se o
diretor reescrever a cena. A cena só é refeita quando o texto dela muda — o
código compara, não refaz por via das dúvidas.

O experimento inteiro (3 propostas + ciclo de correção + 3 formatos) custou
**R$ 1,13** em 13 chamadas.

## As travas que não dependem de modelo nenhum

Cada uma nasceu de um defeito que foi ao ar e passou pelo avaliador:

- **Contraste medido (WCAG).** O diretor escolheu `#242426` para o título
  sobre fundo escuro: 1,2:1, invisível. Agora toda cor é conferida contra o
  fundo que ela vai ocupar e trocada quando não passa. A troca é registrada,
  pra não virar conserto invisível.
- **Véu que se mede.** O escurecimento do topo era fixo em 78%: certo num
  showroom preto, inútil numa parede de concreto ao meio-dia. Agora o brilho
  da faixa de cima é medido e o véu aperta até chegar perto de preto.
- **Fundinho atrás da logo.** A trava de contraste confere texto; logo é
  imagem. A logo vermelha da Área 42 sumia em cena clara. Agora a cor média
  dos pixels opacos da logo é medida e, se não se sustenta, entra um fundo
  escuro — só quando precisa.
- **Corte de frase na palavra.** O limite de 18 caracteres publicou "PRONTA
  PRA TRABALH". Cortar na palavra criou "PRONTA PRA", que não diz nada. Hoje
  são 26 caracteres, que é o que cabe na linha em português.
- **Selo redundante.** Numa Saveiro Cross veio selo "CROSS", escrito duas
  vezes na mesma peça. Selo que só repete palavra do título é descartado.
- **Repetição em erro passageiro.** Uma arte são 4 a 8 chamadas em série; um
  tropeço de DNS na sexta derrubava tudo e jogava fora o que já tinha sido
  pago. Rede, 429 e 5xx repetem até 3 vezes. 400 e 401 não — repetir não
  conserta e gasta de novo.

## Prova do ciclo de correção

Com um plano ruim plantado de propósito (cinza sobre cinza, barra de 34% da
largura comendo o veículo, preço miúdo):

| | nota | o que o avaliador viu |
|---|---|---|
| antes | **5,9** | veículo cortado, contraste baixo, preço sem destaque, espaçamentos inconsistentes |
| depois de 1 rodada | **8,7** | aprovada |

Sem ninguém tocar. O diretor recebeu o plano reprovado e a lista de defeitos,
reescreveu barra, cores, escalas e cenário, e a peça subiu 2,8 pontos.

A peça reprovada foi **plantada**, e isso importa: nas três propostas reais
desta rodada, as três passaram de primeira (8,7 · 8,0 · 9,1). O ciclo existe
pro dia ruim, não pro dia comum.

## O que ainda não está resolvido

- **O avaliador é da mesma casa que o diretor.** gpt-4o avaliando gpt-4.1 é
  separação real, mas parcial: comem do mesmo treino. Um avaliador de outra
  empresa pegaria mais coisa. E ele é generoso: deu 8,0 numa peça com a
  palavra "TRABALH" cortada no meio, e só passou a pegar depois que a régua
  mandou ler palavra por palavra.
- **A revisão humana continua sendo a trava que vale.** A nota serve pra
  ordenar a fila e pra alimentar a correção automática, não pra publicar
  sozinha.
- **O diretor inventa fato.** Saíram chamadas como "IPVA 2024 PAGO",
  "REVISADA" e "ÚNICO DONO" sem ninguém ter dito isso. É bonito e pode ser
  mentira. A chamada precisa vir de uma lista que a loja aprova ou de um campo
  do cadastro — hoje ela sai da imaginação do modelo.
- **Integração no sistema não foi feita.** O protótipo roda fora do app.
  Falta: guardar a cena gerada (a arte é redesenhada a cada abertura hoje, e
  isso custaria R$ 0,82 por visualização), campos de nota e parecer no banco,
  tela mostrando as três propostas pra escolha, e a chave da OpenAI como
  segredo de rede do ambiente — nunca em variável de ambiente comum.
- **A placa do veículo aparece legível.** Decisão de negócio, não técnica.
