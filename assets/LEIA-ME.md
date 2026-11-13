# Arquivos que o gerador de imagem lê em tempo de execução

Esta pasta não é `public/`. O que está aqui **não** é servido na web: é lido
pelo servidor com `readFile(join(process.cwd(), "assets/..."))`, que é o
caminho documentado pelo Next pro `ImageResponse` (ver
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`).

## Anton-Regular.ttf

A tipografia pesada do relatório do cliente. Licença SIL Open Font 1.1 —
pode ser distribuída junto do projeto.

Está aqui e não vem da internet de propósito: buscar fonte na hora de gerar
deixaria o relatório dependendo de um site de fora ficar de pé, e o dia em
que ele cair é o dia em que ninguém manda relatório.

## legacy-logo.png

A logo da Legacy Digital — águia + `LEGACY7 Digital`, branco e dourado.

Veio de um `WhatsApp Image ....jpeg` de 1080×1080, que é um quadrado preto
com a logo pequena no meio. Usado assim, a logo sairia minúscula no
relatório: a altura que o desenho pede seria gasta quase toda com fundo.
Então a borda preta foi cortada:

```
node -e '
const sharp = require("sharp");
sharp("entrada.jpeg").trim({ threshold: 20 }).png().toFile("assets/legacy-logo.png");
'
```

O `threshold: 20` existe porque JPEG não guarda preto exato — perto da logo o
fundo vira `#030202`, `#010101`. Sem folga, o corte para na primeira sujeira
e não corta nada. Resultado: 544×265.

Como é JPEG de origem, não tem transparência: ela traz o próprio retângulo
preto. Por isso o fundo do relatório é `#000000` e não um preto aproximado —
assim a emenda some. Se um dia aparecer um PNG com fundo transparente, trocar
o arquivo basta.

Se este arquivo sumir, o relatório escreve o nome em letra em vez de quebrar.
