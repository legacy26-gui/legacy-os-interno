# O que ainda vamos fazer

A lista é do Guilherme. O que está em volta dela — estado, dependência e
ordem — é leitura minha do código em 13/11/2026, pra lista parar de viver num
print e passar a dizer quanto falta pra cada coisa.

Quando um item sair, ele some daqui e vira seção em `docs/`.

---

## Antes de tudo: duas coisas que não são funcionalidade

**~~O backup não roda.~~ Resolvido em 13/11/2026.** Sai todo dia às 3h da
manhã, criptografado, guardado fora do Neon e fora da Vercel. A primeira
cópia tem 244 MB e 60 tabelas.

Falta um teste que ninguém fez ainda: **restaurar**. Backup que nunca foi
aberto é esperança, não backup. Baixar o arquivo e conferir que a senha o
decifra é tarefa de um dia tranquilo — melhor descobrir ali que num dia ruim.

**~~O token de escrita da Meta.~~ Resolvido em 13/11/2026**, com uma ressalva
que vira pendência: é um token do Graph Explorer, de **60 dias**. Quando
vencer, o Meta Ads inteiro para de atualizar sem avisar, e o sintoma vai
parecer defeito do sistema.

Duas saídas, e a segunda é a boa:

1. Anotar na agenda pra renovar a cada dois meses.
2. **Trocar por um token de usuário do sistema**, que não expira. Hoje a BM
   não libera — vale descobrir por quê (costuma ser verificação da BM ou
   papel de administrador).

E vale fazer o sistema avisar sozinho quando o token estiver perto de vencer:
o aviso tem que chegar antes da parada, não depois.

**~~Dois projetos na Vercel apontando pro mesmo repositório.~~ Era diagnóstico
errado meu, desfeito em 13/11/2026 às 18h.**

Eu tinha escrito que o endereço da equipe (`legacy-os-interno.vercel.app`)
estava preso em código velho e que o do time `legacy9` estava protegido por
senha. Nenhuma das duas coisas era verdade. O domínio sempre esteve ligado ao
projeto do `legacy9` — ele responde de
`legacy-os-interno-ki4os2the-legacy9.vercel.app` e abre o login sem senha
nenhuma.

O que havia era uma coisa só: **todo build falhava desde as 10:11**, por causa
da corrida de migração. O site continuava servindo a última versão que deu
certo, e eu li isso como "projeto errado". Um deploy parado parece muita coisa
que ele não é.

Fica a lição, porque ela se repete: **o site no ar não prova que o deploy
subiu.** Por isso o `/api/version` agora devolve `builtAt` congelado no build
e o id da implantação — dois pedidos seguidos têm que dar o mesmo valor.

**A fatura da Vercel em atraso.** O time aparece como `Overdue` com aviso de
suspensão: *"pay any open invoices before your account is shut down"*.
Suspensão derruba o site **e o banco junto**, porque o Neon é cobrado por ali.

É o maior risco aberto hoje — maior que qualquer defeito de código, porque
nenhum conserto sobrevive à conta ser desligada. É também o único item desta
página que não tem solução técnica.

---

## O que já existe e sustenta o resto

Vale saber, porque muda o tamanho de quase todo item abaixo:

| Peça | Onde | Serve pra |
|---|---|---|
| Robô diário | `vercel.json` → `/api/alertas/rodar`, 11h UTC | pendurar qualquer rotina automática |
| Varredura da Meta | `src/lib/meta/varredura.ts` | já roda dentro do robô |
| Motor de alertas + push | `src/lib/alertas/`, `/api/push` | avisar sem ninguém abrir a tela |
| Cliente de IA | `src/lib/ai/` (Anthropic e OpenAI) | qualquer item de IA, sem integrar nada novo |
| Tabela `tasks` | `prisma/schema.prisma` | criada, com dono e prazo, **sem uso** |
| Relatório PNG | `/api/meta-ads/relatorio` | pronto, falta só disparar sozinho |

---

## A ordem que eu defenderia

Não é a ordem da lista — é a que faz cada item chegar mais barato por causa do
anterior.

### 1. Relatório automático

**Feito em 13/11/2026, menos o envio.** O que existe hoje:

- O PNG saiu do branco-e-roxo do sistema e virou a arte da Legacy: preto,
  dourado, a águia, os quatro números em cartão. Só o geral — a lista por
  campanha saiu a pedido do Guilherme ("quem recebe é dono de loja").
- Fica pronto sozinho às **8h de Brasília** (o robô roda 11:00 UTC) com
  números de no máximo quinze minutos.
- Aparece no **Meu Dia** toda segunda, loja por loja, com um botão "Enviei".
  O bloco fica até a última ser marcada — some na terça seria transformar o
  esquecimento em silêncio.
- Vira **alerta no celular** quando falta mandar: lembrete na segunda,
  cobrança na quarta, problema na sexta. A direção só é avisada a partir da
  quarta.

**Falta só o envio**, e ele depende de uma coisa que não é código: conectar um
número na API oficial do WhatsApp. Duas coisas a saber antes de montar tudo
em cima de grupo:

1. Tem que ser a **WhatsApp Business Platform** (API oficial), não o WhatsApp
   comum nem o Business do celular. Atalho aqui derruba o número da agência.
2. **Grupo é mais difícil que conversa direta.** A API oficial manda bem pra
   número de pessoa; pra grupo é limitado e muda. Plano B: mandar pro dono.

Quando o número existir, o que entra é o envio e o cadastro de qual grupo é de
qual loja — a marcação de "enviado" passa a ser feita pelo sistema, e a tela
não muda.

### 2. Tarefas no Meu Dia

**Meio caminho andado.** A tabela `tasks` já tem título, responsável, prazo,
prioridade e status. Falta a tela e as ações.

O Meu Dia já é a tela da fila do dia (conferência + vendas + contas de
anúncio); tarefa é a quarta coisa que cabe ali naturalmente.

### 3. Resumo diário inteligente

**Depende do 2 estar lá.** O cliente de IA existe e os dados ficaram bons
(Meta ligado, vendas, saldo, arte cansada). O resumo é a IA lendo o que o Meu
Dia já mostra e escrevendo as três frases que importam.

Cuidado registrado: o Meu Dia atual é determinístico e auditável. O resumo
entra **em cima** dele, nunca no lugar — regra que erra se explica, IA que
erra não.

### 4. IA consultora de tráfego

Boa parte do valor já foi entregue **sem IA**: dias de saldo, arte cansada,
verba fora do combinado são regras simples, auditáveis e que explicam o
próprio motivo. A IA entra pro que regra não pega — ler a conta inteira e
dizer "o problema dessa loja é público, não criativo".

Depende de histórico: quanto mais meses de `meta_insights_daily`, melhor. Por
isso não é pra agora.

### 5. Automatizar desativação por WhatsApp

**O primeiro item que fala com o cliente final.** Risco de outra natureza: um
erro aqui manda mensagem errada pro dono da loja, não só mostra número errado
numa tela interna.

Precisa de duas coisas: a API oficial do WhatsApp (número comercial, modelos
aprovados) e **entender como a loja avisa hoje que vendeu um carro**. A
segunda é conversa, não código, e tem que vir primeiro.

### 6. Copiloto Legacy

Sobrepõe bastante com o 3 e o 4 — talvez sejam um só com três portas de
entrada. Vale decidir isso antes de construir, senão viram três coisas que
respondem a mesma pergunta de jeitos diferentes.

### 7. Indicadores internos (equipe, produção)

Parte existe espalhada: Gestão de Contas, Ranking de Lojas, Controle de
Vendas. É mais juntar e dar foco do que construir do zero.

### 8. Planejamento semanal automático

Depende do 2 (tarefas) e do 7 (indicadores): sem saber o que a equipe faz e
como as contas estão, o plano é chute formatado.

### 9. IA financeira

O módulo Financeiro já existe com DRE e DFC. A IA aqui lê o que já está
lançado — então depende da qualidade do lançamento, não de código novo.

### 10. Automatizar o design

O maior dos itens, e o de resultado mais incerto: arte gerada que não
parece da marca é arte que ninguém publica. Faz sentido depois que a arte
cansada estiver sendo detectada bem (já está) e que exista um acervo do que
funcionou (`meta_ad_creatives` está acumulando).

### 11. Inteligência comercial

Marcada como último passo pelo próprio Guilherme.

---

## Mexer em anúncio pelo sistema

Não está na lista, mas é o que estava em andamento quando ela chegou, e
alimenta vários itens acima.

- **Ligar e desligar** — pronto, esperando o token de escrita.
- **Editar legenda, título, descrição e foto** — na Meta isto não é edição, é
  substituição do criativo. Ver a seção "Ligar e desligar pelo sistema" em
  `docs/meta-ads.md`.
- **Duplicar reaproveitando o post id** — é o que preserva curtida e
  comentário, porque a prova social pertence ao post, não ao anúncio. É o
  botão que falta no aviso de arte cansada.

Dúvida em aberto, a ser resolvida por medição e não por opinião: editar o
texto de um anúncio muda o `effective_object_story_id`? Se não muda, a prova
social sobrevive. O sistema vai gravar o id antes e depois de cada edição, e
a primeira edição real responde isso com dado nosso.
