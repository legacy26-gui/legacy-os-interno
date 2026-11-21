# Inteligência Comercial — Sugestões

**Onde:** Inteligência Comercial → aba **Sugestões** (`/inteligencia-comercial/sugestoes`). As 5 mais urgentes também
aparecem na Visão geral.

O estoque do site de cada loja (ver `estoque.md`) cruzado com os anúncios da Meta, os leads e as vendas registradas.
Cada sugestão diz **o porquê, com os números**, e **o que fazer**. Só aparecem lojas com o site de estoque ligado.

## As sugestões (da mais urgente pra menos)

| # | Tipo | Quando aparece | O que fazer |
|---|------|----------------|-------------|
| 1 | Anúncio de carro que saiu do site | o carro sumiu do site e o anúncio dele continua **entregando** (sem venda registrada) | confirmar se vendeu; pausar e registrar a venda |
| 2 | Preço diferente do site | o R$ escrito no anúncio difere do preço do site em R$ 500+ | conferir com a loja e atualizar a legenda |
| 3 | Gasto sem lead | anúncio ativo do carro gastou R$ 150+ e trouxe 0 lead | trocar criativo ou pausar |
| 4 | Lead sem venda | parado 45+ dias com 15+ leads e nenhuma venda | conversar com a loja: preço, condição, atendimento |
| 5 | Acima da FIPE | preço do site 10%+ acima da FIPE (em faixa, acima do MAIOR preço) e o carro sem outra sugestão | destacar diferenciais no anúncio; se parado, o preço pode ser o motivo |
| 5b | Lead caro | custo por lead 2x+ a média da própria loja (com R$ 100+ gastos) | testar outro criativo ou rever preço |
| 6 | Carro novo sem anúncio | entrou no site há até 7 dias e não tem anúncio | **Subir anúncio** (abre o formulário com o carro preenchido) |
| 7 | Parado sem anúncio | 45+ dias no site e sem anúncio | anunciar (se a loja quiser) |
| 8 | Parado | 45+ dias com anúncio | criativo novo / conversar sobre preço |
| 9 | Abaixo da FIPE | 5%+ abaixo da FIPE **exata**, sem outra sugestão | pôr "abaixo da FIPE" na legenda |

Carro que já tem outra sugestão não ganha cartão de FIPE: a frase ("17% acima da FIPE…") entra no **mesmo** cartão,
porque junto ela explica (ex.: lead sem venda + preço acima da FIPE).

Os números ficam em `REGUA`, em `src/lib/inteligencia/sugestoes.ts`: mudar ali muda a régua do sistema inteiro.

## Regras que não mudam

- **Carro ↔ anúncio só com certeza, nos dois sentidos.** O título do carro precisa achar o anúncio sem dúvida E o
  nome do anúncio precisa achar este carro (e só ele) no estoque. Dois carros iguais e um anúncio = "incerto", e
  incerto nunca vira "sem anúncio" (seria mandar anunciar o que já está anunciado).
- **Carro que sumiu do site não é assunto**, a não ser que o anúncio dele continue gastando.
- **Carro com venda registrada** (anúncio na venda do Controle de Vendas) não recebe sugestão.
- **Idade do carro:** conta desde que o sistema viu o carro. Carro que já estava no site quando a leitura foi ligada
  aparece como "pelo menos N dias" e nunca como "novo".
- Gasto e leads são os de **vida inteira** do anúncio (somando cópias do mesmo carro).
- Nada aqui avisa ninguém (push/WhatsApp): é só a tela. Gestor vê só as lojas dele.

## FIPE

- Fonte: API pública `fipe.parallelum.com.br` (v2). Grátis: 1.000 consultas/dia e 50/minuto. Com `FIPE_TOKEN`
  (conta gratuita deles) a cota sobe; vai no cabeçalho.
- **Casamento** (`src/lib/fipe/casar.ts`): marca (com apelidos "VW - VolksWagen", "GM - Chevrolet"), versões que começam
  com o modelo do site, **travas** (cilindrada, câmbio, válvulas, combustível, hatch x sedan, turbo) e pontos pelas
  palavras da versão (LTZ, Highline, Griffe…). A versão precisa ter o **ano** do carro; se a melhor não tem, vale a próxima.
  Um vencedor = **exato**; empate de até 4 = **faixa** (menor e maior preço); senão **"não achei"** — nunca o preço de outro carro.
- Testado com os 55 carros reais da R2: 48 exatos, 3 em faixa, 3 sem FIPE (Fit LXL 2010, HB20 1.0 2014, Gol G5 2012).
- **Quando:** rotina própria às 9h30 e 15h30 (`/api/estoque/fipe`, 180 consultas por rodada) e um pouco a cada "Ler agora"
  na tela de Estoque. Respostas em cache (`fipe_cache`): marcas/versões/anos 30 dias, preço 20 dias. Cada carro é reconferido
  a cada 20 dias. Cota acabou ou a FIPE pediu pra esperar: para, e o resto fica pra próxima rodada.
- **Tela de Estoque:** coluna FIPE (tela larga) com a diferença em %; passe o mouse pra ver a versão e o mês da tabela.

## Ainda não feito

- Texto da IA em cima dos fatos (ex.: o recado pronto pro dono da loja), e resumo semanal no WhatsApp do gestor.

## Código e testes

`src/lib/inteligencia/sugestoes.ts` (motor puro), `sugestoes-da-carteira.ts` (banco), tela em
`src/app/(app)/inteligencia-comercial/sugestoes/page.tsx`. Testes: `t-sugestoes.mjs` (regras), `t-fipe.mjs` (casamento e rodada com as respostas reais da FIPE dos 55 carros da R2),
`ic-tela2.mjs` e `fipe-tela.mjs` (navegador).
