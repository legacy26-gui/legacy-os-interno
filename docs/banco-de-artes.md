# Banco de artes

Onde: **Inteligência Comercial → Estoque → (loja) → Banco de artes**  (`/inteligencia-comercial/estoque/[clientId]/artes`). Também tem link na Campanha do zero.

## Regras (decisão do Guilherme)
1. A arte do carro é **sempre a 1ª foto** do anúncio.
2. A **proporção da arte vale pro anúncio todo**: as fotos do site são cortadas pelo centro na mesma proporção e no mesmo tamanho da arte (nada é esticado).
3. Uma arte por carro. Subir outra arte pro mesmo carro deixa a antiga sem carro (dá pra reatribuir ou apagar).

## Como usar
- "Subir artes" aceita várias de uma vez (JPG/PNG/WEBP, até 6 MB cada). A arte é guardada em JPEG, no máximo 1440 px no lado maior.
- O sistema liga sozinho pelo **nome do arquivo** (`compass limited 2022.png`, ou o código do carro no site). Se tiver dúvida (dois Argos, `IMG_2033.jpg`), não chuta: a arte fica com borda amarela pra escolher o carro no seletor.

## Onde a arte é usada
- Campanha do zero (`criarAnuncioDoCarro`): arte + até (fotos − 1) do site.
- "Anunciar agora" do estoque (`anunciar-agora.ts`): arte + até 5 do site.
- Se o site não der foto mas houver arte, o anúncio sai só com a arte.

Código: `src/lib/estoque/artes.ts` (preparar, cortar, `fotosComArte`), `artes-puro.ts` (adivinhar o carro), `src/lib/actions/artes.ts`, imagem em `/api/estoque/arte/[id]` (só para quem tem a loja na carteira). Tabela `artes_dos_carros`.
