# Indicadores da equipe

Tela `/indicadores` (menu Operacional → Indicadores da Equipe). Código: `src/lib/indicadores/equipe.ts` e `src/app/(app)/indicadores/page.tsx`.

## Regras (decididas pelo Guilherme)

- **Quem vê:** só dono e gerência (`veTodaACarteira`: ADMIN e GERENTE — o Guilherme e a Andrielli). A gestora de tráfego é redirecionada e não vê o item no menu.
- **Placar por função**, não nota única: Gestão de tráfego (GESTOR_TRAFEGO), Gerência (GERENTE), Direção (ADMIN). Cada função tem as suas colunas principais; outra coluna só aparece se alguém daquela função fez algo dela no período.
- **Só na tela.** Nada vai pro WhatsApp.

## Períodos

Esta semana (segunda até hoje), semana passada, este mês, mês passado — em dias da casa (America/Sao_Paulo). Coluna de data compara com meia-noite UTC; coluna de data e hora, com meia-noite de Brasília (03:00 UTC).

## O que cada coluna conta

Só o que o sistema registra com o nome de quem fez:

| Coluna | Fonte |
|---|---|
| Lojas | clientes com `managerId` = pessoa (sem cancelados) — contexto |
| Ritmo do Meu Dia | conferências ÷ (lojas × dias úteis do período), 0–100% — contexto |
| Conferências | `ClienteConferido.quemId` |
| Revisões escritas | `DailyReview` com `notes` |
| Revisões semanais | `WeeklyReview` |
| Relatórios | `RelatorioEnviado.quemId` |
| Anúncios subidos | `MetaAcao` origem `criacao-rascunho`, nível anúncio |
| Ações no Meta | `MetaAcao` ok, outras origens (pausar, ligar, texto, verba) |
| Vendas lançadas | `ClientSale.createdById` |
| Resgates / Pedidos de verba | `AcaoDeResgate`, `PedidoDeVerba` |
| Artes / Artes revisadas | `StudioArte` criadoPor / revisadoPor |
| Relatórios decididos | `RelatorioParaAprovar.decididoPorId` |
| Etapas de implantação | `OnboardingEtapa.concluidoPorId` |
| Gravações / Entregas | `Gravacao` gravadoEm / entregueEm |
| Tarefas | `Task` FINALIZADO (updatedAt no período) |
| Anotações | `ClientHistory.authorId` |

"Quem mais fez" soma só as colunas de esforço da função (Lojas e Ritmo são contexto). O troféu marca o líder de cada coluna. Pessoa sem carteira e sem nenhum registro no período não aparece.
