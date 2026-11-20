# Subir anúncio como rascunho (IA prepara, gestor publica)

O gestor escolhe a campanha e o conjunto, manda as fotos do designer e a legenda. O sistema sobe o
anúncio **PAUSADO**, dentro do conjunto. O gestor confere no Gerenciador e publica. O sistema nunca ativa
anúncio.

## Regras (não mudam)

1. O anúncio sempre nasce **pausado**. Não há caminho no código que ative.
2. O conjunto precisa ser de uma conta da loja (trava de cadastro, igual às outras escritas na Meta).
3. **Orçamento e localização ficam no conjunto**, não no anúncio. O sistema **lê** e avisa; **nunca altera**.
   Como a maioria dos anúncios entra num conjunto que já existe, o aviso é o que importa.
4. A página do Facebook que assina o anúncio vem de um anúncio que já existe no conjunto. Conjunto sem
   anúncio é recusado com o motivo.
5. Foto única vira foto; duas ou mais viram carrossel (ordem de envio = ordem do carrossel, até 10).

## Já feito (núcleo, testado com Meta de mentira)

`src/lib/meta/rascunho-anuncio.ts` — `criarRascunhoDeAnuncio()`:
- confere o conjunto, lê orçamento, localização e página;
- sobe as fotos (`adimages`), cria o criativo (`adcreatives`), cria o anúncio (`ads`, PAUSED);
- grava no histórico de ações (`origem: criacao-rascunho`);
- se o criativo for criado e o anúncio recusado, diz que o criativo ficou solto e não gasta.

## Avisos que o gestor vê antes de publicar

- conjunto anuncia em outra cidade que não a da loja;
- conjunto sem cidade na segmentação (só raio);
- orçamento do conjunto muito diferente do investimento previsto da loja (÷ 30 dias). Só aviso.

## Ainda não feito

- a tela (escolher campanha e conjunto, enviar fotos, ver os avisos);
- a legenda escrita pela IA, com a voz da loja e a arte;
- lista de rascunhos com o link pro Gerenciador.
