# Etapas da implantação

Dentro de cada ficha, em **Formulários**, tem a lista do que precisa ser feito
pra o cliente novo entrar no ar. É o controle do que a Andrielli já fez e do
que falta.

## Como se usa

Clica no quadradinho e a etapa fica marcada, guardando **quem marcou e
quando**. Clicar de novo desmarca, pra desfazer o engano.

Em etapa já marcada aparece **"Anotar algo"**: serve pra guardar o detalhe
("acesso veio incompleto", "cliente pediu pra mandar segunda"). Só existe em
etapa feita — anotação sobre coisa que não aconteceu não teria onde morar.

No alto da ficha, ao lado do status, aparece **"3/12 etapas"**, e a barra
mostra o andamento sem precisar abrir nada.

## As etapas

Hoje são 12, em três fases: **Fechamento**, **Acessos** e **Subir a
operação**. A lista está em `src/lib/etapas-implantacao.ts`.

> **A lista é um ponto de partida, não veio do Guilherme.** Foi montada a
> partir do que o sistema já mostra da operação (contrato, acessos da Meta,
> grupo, criativos). Precisa ser corrigida pra bater com o processo real.

Mudar é mexer só nesse arquivo: a tela, a barra e o contador leem de lá.

**Regra de ouro ao mexer:** o `id` de cada etapa é o que liga a marcação ao
banco. Mudar o texto do `label` é livre. Mudar o `id` de uma etapa já usada
faz as marcações antigas dela sumirem da tela.

Tirar uma etapa da lista **não apaga** o que já foi marcado: a linha fica no
banco e volta a aparecer se a etapa voltar. Mexer na lista não pode apagar
histórico de trabalho feito.

## Por que a lista mora no código e não no banco

Porque ela é processo da casa, não dado do cliente. No banco só entra o que
FOI feito. Assim acrescentar, tirar ou renomear etapa não exige migração e
não encosta em ficha nenhuma.

## Quem mexe

A mesma permissão do módulo de Formulários. Isso inclui a Andrielli, que tem
acesso liberado individualmente — mas atenção: a liberação casa pelo e-mail
dela começar com `andriel` **dentro do domínio `@legacydigital.com`** (ver
`ACESSOS_POR_PESSOA` em `src/lib/permissions.ts`). Com e-mail fora desse
domínio ela não entra na tela.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/lib/etapas-implantacao.ts` | a lista das etapas e o cálculo do progresso |
| `prisma/schema.prisma` → `OnboardingEtapa` | o que foi marcado |
| `src/lib/actions/etapas.ts` | marcar, desmarcar, anotar |
| `src/app/(app)/formularios/etapas-da-ficha.tsx` | a lista na tela |
| `src/app/(app)/formularios/page.tsx` | o contador no cabeçalho da ficha |

Migração: `20261109120000_etapas_de_implantacao`.
