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
| 5 | Lead caro | custo por lead 2x+ a média da própria loja (com R$ 100+ gastos) | testar outro criativo ou rever preço |
| 6 | Carro novo sem anúncio | entrou no site há até 7 dias e não tem anúncio | **Subir anúncio** (abre o formulário com o carro preenchido) |
| 7 | Parado sem anúncio | 45+ dias no site e sem anúncio | anunciar (se a loja quiser) |
| 8 | Parado | 45+ dias com anúncio | criativo novo / conversar sobre preço |

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

## Ainda não feito

- **Comparação com a tabela FIPE** (próximo passo: depende de uma fonte da FIPE e de casar modelo/versão).
- Texto da IA em cima dos fatos (ex.: o recado pronto pro dono da loja), e resumo semanal no WhatsApp do gestor.

## Código e testes

`src/lib/inteligencia/sugestoes.ts` (motor puro), `sugestoes-da-carteira.ts` (banco), tela em
`src/app/(app)/inteligencia-comercial/sugestoes/page.tsx`. Testes: `t-sugestoes.mjs` (regras) e `ic-tela2.mjs` (navegador).
