# Resolver — a loja que parou de vender

Três coisas fazem uma loja parar de vender, e a tela responde as três de cima
pra baixo:

| | Mostra | Ação |
| --- | --- | --- |
| **1. Vídeos** | há quantos dias foi a última entrega | agendar gravação |
| **2. Arte** | há quantos dias com a mesma arte | renovei a arte hoje |
| **3. Comercial** | o passo da escada | registrar o contato / marcar reunião |

Chega-se por ela pelo botão **Resolver**, no Controle de Vendas — e ele só
aparece em quem já passou dos **15 dias**. Numa loja vendendo o botão seria
ruído, e ruído todo mundo aprende a pular.

## A tela não adivinha o motivo

Ela mostra as datas e deixa quem conhece a loja decidir. Sistema que chuta o
diagnóstico erra, e depois de errar duas vezes a equipe aprende a ignorá-lo.

## A escada do comercial

```
até 14 dias   nada a fazer — é trabalho normal, cobrar aqui vira ruído
15 ou mais    primeiro contato: ligar e entender o que mudou na loja
30 ou mais    reunião: senta com o dono, e o Guilherme entra junto
```

Uma ação só conta **se aconteceu depois da última venda**: contato de três
meses atrás não resolve a parada de agora. Por isso a tela diz "passo da vez
já feito" olhando a data da venda, e não a data do contato sozinha.

## Reunião e aviso são um botão só

"Marquei a reunião" e "avisar o Guilherme" saem juntos de propósito: é um
movimento só na cabeça de quem faz, e separar garantiria que um dia alguém
faz o primeiro e esquece o segundo.

Se o aviso no celular falhar, **o registro da reunião é mantido** e a tela diz
isso com todas as letras. A reunião aconteceu de qualquer jeito, e perder o
registro por causa de uma notificação seria o pior negócio dos dois.

## A arte

Vira uma data no cliente (`ultimaArteEm`), igual à última visita: um botão
marca hoje, e o "outro dia" abre o calendário.

A casa considera a arte **gasta a partir de 30 dias**. Esse número é um ponto
de partida, não uma verdade — o Guilherme disse que não sabia como medir arte,
então começa no mesmo ciclo que o resto do sistema já usa e se corrige com o
uso.

## O vídeo não tem ação de registro aqui

De propósito: a gravação se registra em Gravações, e a entrega dela já é o
dado. Um segundo lugar pra dizer a mesma coisa desencontraria num deles.

## Onde está no código

| Arquivo | O que faz |
| --- | --- |
| `src/lib/resgate.ts` | a escada, o estado da arte, as cores |
| `src/lib/actions/resgate.ts` | arte, contato, reunião e o aviso |
| `src/app/(app)/resolver/[clientId]/page.tsx` | a tela |
| `src/app/(app)/resolver/[clientId]/acoes.tsx` | os botões |

Migração: `20261111160000_arte_e_resgate`.
