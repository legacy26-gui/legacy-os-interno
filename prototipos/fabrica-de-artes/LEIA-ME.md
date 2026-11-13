# Protótipo da fábrica de artes

**Isto não roda dentro do sistema.** É o protótipo que foi medido em
13/11/2026 e que embasa o `docs/studio-fabrica.md` — leia aquele arquivo
primeiro, é lá que está o que se aprendeu.

O código está aqui pra não se perder: a integração no app vai reaproveitar o
diretor, o avaliador, as travas de contraste e o motor de composição quase
inteiros. O que falta é o redor — guardar a cena gerada, gravar nota e
parecer no banco, e a tela de escolha entre as três propostas.

## Como rodar

Precisa de uma chave da OpenAI com acesso a `gpt-4.1`, `gpt-4o` e
`gpt-image-2`.

```bash
cd prototipos/fabrica-de-artes
ln -s ../../node_modules node_modules       # usa o sharp e o next/og do projeto
printf '%s' 'SUA-CHAVE' > .chave && chmod 600 .chave
node rodar.mjs
```

Sai tudo em `saida/`: as três propostas, cada rodada de correção, os três
formatos finais e o `registro.json` com planos, notas, pareceres e custo
chamada por chamada.

`folha.mjs` monta as folhas de comparação a partir do `registro.json`, depois
que `rodar.mjs` terminou.

## A chave

`.chave` fica fora do git (veja o `.gitignore` deste diretório) e nunca
aparece em log, erro ou retorno. Na integração ela não vira variável de
ambiente comum: entra como **segredo de rede do ambiente** para
`api.openai.com`, igual aos tokens do Meta.

## Os arquivos

| arquivo | o que faz |
|---|---|
| `rodar.mjs` | amarra tudo e grava o registro |
| `diretor.mjs` | `gpt-4.1` → três planos em JSON, e as correções |
| `compor.mjs` | Satori + sharp: dados reais por cima da cena, 3 formatos |
| `avaliador.mjs` | `gpt-4o` → nota 0-10 em sete categorias |
| `cores.mjs` | contraste WCAG, a trava que não depende de modelo |
| `openai.mjs` | as chamadas, com repetição e a conta de custo correndo |
| `tira-logo.mjs` | tirou a logo da Área 42 da própria foto, pro teste |
| `conferir.mjs` | mede região de imagem de verdade (veja o aviso abaixo) |

## Uma armadilha que custou tempo

`sharp(...).extract(...).stats()` **ignora o extract** e devolve a estatística
da imagem inteira. Toda medição de região encadeada assim dá o mesmo número,
e o engano é silencioso. É preciso materializar o recorte com `.toBuffer()`
antes de pedir `stats()` — é o que o `conferir.mjs` faz.
