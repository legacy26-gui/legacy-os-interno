# Separação entre as empresas — o que protege o quê

Este documento existe porque a pergunta "posso dar acesso do Treinamentos pro
sócio sem ele ver nada da agência?" precisa de uma resposta verificável, não de
uma opinião.

## A regra que vale

**Lista de liberação, não de bloqueio.** `MODULOS_DO_TREINAMENTOS`, em
`src/lib/permissions.ts`, diz quais telas existem no Legacy Treinamentos.
Hoje são quatro: Dashboard, Financeiro, Comercial e Gravações. **Tudo que não
está nessa lista não abre.**

Isso é de propósito e é a parte mais importante do desenho. Antes era o
contrário — uma lista do que era bloqueado — e bastava criar uma tela nova e
esquecer de incluí-la pra ela nascer liberada. Com lista de liberação, tela
nova nasce fechada: o erro possível vira "falta uma aba", não "vazou o caixa".

## As três camadas

1. **Menu** — a aba some. Não protege nada sozinho; é conforto.
2. **Tela** — `requireModuleAccess` confere o cargo **e** a empresa aberta.
   Quem digita o endereço na mão cai no Dashboard com o motivo escrito.
3. **Consulta ao banco** — é a que vale. Toda busca de dinheiro e de funil leva
   `empresa` no `where`; toda alteração usa `updateMany`/`deleteMany` com
   `{ id, empresa }`, porque o id vem do navegador e não prova de quem é.

O cookie que guarda a empresa escolhida **nunca decide sozinho**: é conferido
contra a lista de empresas que a pessoa tem no banco, a cada consulta.

## Administrar usuário é de quem vê o grupo inteiro

Cargo de administrador **não basta** pra mexer em usuários. Quem não enxerga
todas as empresas não cria usuário, não reseta senha e não distribui acesso —
nem pra si mesmo.

Sem isso a separação não valeria nada: o sócio precisa ser ADMIN pra ver o
Financeiro do Treinamentos, e um ADMIN abriria Configurações e marcaria a
agência pra ele mesmo. A regra está em `veTodasAsEmpresas`
(`src/lib/empresa.ts`) e é conferida na tela de Configurações e em toda ação
de usuário.

## Aviso no celular também é vazamento

`avisarEmpresa` (`src/lib/push.ts`) manda a notificação só pra quem trabalha
naquela empresa. O aviso de lead carrega o nome da loja e do contato — sem o
filtro, o sócio de uma empresa receberia no celular o lead da outra. Esse
caminho não passa por tela nenhuma, então nenhuma tranca de tela pegaria.

## O que foi corrigido na auditoria de 04/11/2026

| Onde | O que vazava |
| --- | --- |
| `/calendario` | tarefa, contrato e férias da agência, com nome de cliente |
| `/suporte` | chamados e a lista inteira de clientes |
| `/playbooks` | base de conhecimento da agência |
| `/meu-dia` | não tinha conferência de empresa nenhuma |
| `/equipe` | funcionários da agência |
| `/financeiro/analise` | o quadro de MRR e a lista de "tirados da cobrança", ambos com nome e mensalidade de cliente |
| Dashboard | contagem de tarefas, campanhas, relatórios e contratos da agência |
| Notificação push | aviso de lead da agência ia pro celular de todo mundo |
| Configurações | administrador de uma empresa podia dar a si mesmo a outra |

## Como conferir de novo

O teste que prova está em
`/tmp/.../scratchpad/testes/varre-gilberto.mts` (recriar quando precisar): ele
semeia dado da agência com a marca `ZZAGENCIAZZ`, entra como um usuário só do
Treinamentos **com o cookie de empresa forçado pra AGENCIA**, abre as 31 telas
e procura a marca no texto visível, no HTML e em **toda resposta do servidor** —
porque dado pode vazar no payload sem ser desenhado na tela.

Resultado esperado: `VAZAMENTOS: NENHUM`, 22 telas barradas, e o usuário
continuando a ver o que é dele.

**Ao criar qualquer tela nova que mostre dinheiro, cliente ou funil, rode essa
varredura antes de publicar.**
