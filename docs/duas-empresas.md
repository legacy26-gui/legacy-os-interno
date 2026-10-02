# Duas empresas no mesmo sistema

O Legacy OS passou a atender duas empresas do grupo:

- **Legacy Automotivo** — a agência: carteira de lojas, mensalidade, tráfego pago.
- **Legacy Treinamentos** — cursos e treinamentos.

É o mesmo sistema. O que muda é **de quem é o dinheiro, o funil e a meta**.

## Como se usa

No alto da tela, do lado do botão de tema, tem o nome da empresa aberta. Clicando
nele, troca. **Esse botão só aparece pra quem trabalha nas duas** — quem trabalha
em uma só nem vê que existe outra.

Trocar a empresa troca tudo que é de dinheiro e de funil:

| Tela | Fica separado por empresa |
| --- | --- |
| Dashboard | faturado do mês, MRR, meta, % atingido, alertas |
| Financeiro | entradas, saídas, a pagar, a receber |
| Análise financeira | tudo, inclusive despesa fixa e por cliente |
| DRE | receita, imposto, despesa, EBITDA, lucro |
| DFC | entradas, saídas, saldo em caixa, saldo inicial |
| Comercial (quadro) | os cartões do funil |
| Comercial (dashboard) | leads, reuniões, vendas, CPL, CAC, verba por canal |
| Metas | meta de faturamento e meta de vendas, mês a mês |

## O que só existe na agência

Essas telas somem quando o Treinamentos está aberto, porque dependem da carteira
de lojas, que é da agência: **Clientes, Formulários, Contratos, Operações,
Tráfego, Relatórios, Gestão de Contas, Marketing**.

No dashboard, o bloco "Operação" fica reduzido, e os painéis "Formulário da
landing" e "Conexão com a Meta" não aparecem no Treinamentos — a landing e o
Pixel são da agência.

Abrir uma dessas telas pelo endereço, com o Treinamentos aberto, cai no dashboard
com o aviso: *"Essa tela é da outra empresa do grupo"*.

## Quem vê o quê

Em **Configurações**, cada pessoa tem uma coluna "Empresas". Clicando no nome da
empresa, liga e desliga o acesso dela. Todo mundo precisa de pelo menos uma.

- Administrador nasce com as duas.
- O resto da equipe nasce só na agência.
- O sócio do Treinamentos fica só em "Legacy Treinamentos".

## Por que isso é seguro de verdade

A separação **não é o menu**. Esconder uma aba não protege nada: quem digita o
endereço na mão chega na página do mesmo jeito.

O que protege é o filtro na consulta ao banco:

1. `src/lib/empresa-atual.ts` diz qual empresa está aberta. A escolha fica num
   cookie, mas o cookie **nunca decide sozinho** — é sempre conferido contra a
   lista de empresas que a pessoa tem no banco. Cookie forjado não abre nada
   (testado: trocando o cookie na mão, a tela continua mostrando a empresa certa).
2. Toda leitura de dinheiro e de funil leva `empresa` no `where`.
3. Toda alteração usa `updateMany`/`deleteMany` com `{ id, empresa }` em vez de
   `update({ where: { id } })`. O id vem do navegador e não serve de prova de
   nada — então mandar o id de uma receita da agência estando no Treinamentos
   simplesmente não encontra registro pra mexer (testado: 0 linhas afetadas, o
   registro intacto).

## O que ficou de fora de propósito

- **Cliente, contrato, campanha e relatório continuam só da agência.** O
  Treinamentos não tem loja pra gerir. O comprador de curso ganha modelo próprio
  na etapa seguinte.
- **Receita sem cliente.** Virou possível (`revenues.clientId` deixou de ser
  obrigatório), senão o financeiro do Treinamentos não conseguiria lançar nada.
  Nesse caso quem identifica a entrada é a descrição.
- **Visão consolidada do grupo** (as duas somadas, só pra quem vê as duas) é a
  etapa 3.

## Migrações

- `20261002120000_separacao_por_empresa` — cria o tipo `Empresa`, a coluna em
  cada tabela de dinheiro e de funil, e a lista de empresas no usuário. Tudo que
  já existia fica como `AGENCIA`; administrador recebe as duas.
- `20261002130000_entrada_sem_cliente` — `revenues.clientId` deixa de ser
  obrigatório.
- `20261002140000_verba_por_empresa` — a verba de anúncio por canal passa a ser
  por empresa (as duas anunciam no mesmo canal no mesmo mês).
