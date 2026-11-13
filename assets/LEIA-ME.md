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

## legacy-logo.png  (FALTA)

A logo da Legacy Digital — águia + `LEGACY7 Digital`, branco e dourado sobre
fundo preto. Enquanto o arquivo não estiver aqui, o relatório desenha o nome
em letra, sem a águia; assim ele continua saindo em vez de quebrar.

Pra colocar: suba o PNG com esse nome exato nesta pasta. Fundo transparente
é melhor que fundo preto (o relatório já é preto, e fundo chapado cria um
retângulo visível em volta).
