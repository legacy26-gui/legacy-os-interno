-- Destrava a migração `meta_acoes`, que ficou marcada como quebrada em
-- 13/11/2026 e passou a derrubar TODA implantação da Vercel em dez segundos.
--
-- ── O que aconteceu ──────────────────────────────────────────────────────
--
-- O `vercel-build` rodava `prisma migrate deploy` em toda implantação, e a
-- Vercel constrói duas por commit (Preview e Production) ao mesmo tempo,
-- contra o mesmo banco. As duas tentaram aplicar `meta_acoes` no mesmo
-- segundo. Uma criou a tabela; a outra bateu na tabela já criada, falhou no
-- meio e deixou a linha dela sem `finished_at` em `_prisma_migrations`.
--
-- Daí em diante, todo build morria com:
--
--   Error: P3009
--   migrate found failed migrations in the target database,
--   new migrations will not be applied
--
-- O Prisma está certo em recusar: construir em cima de uma migração
-- quebrada é construir em cima de parede torta. A causa já foi removida em
-- `scripts/migrar.mjs` (só a implantação de produção migra). Este arquivo
-- limpa o que ficou para trás.
--
-- ── Por que não é só "marcar como aplicada" ──────────────────────────────
--
-- A migração tem cinco passos: a tabela, dois índices e duas chaves
-- estrangeiras. A implantação que falhou pode ter parado no primeiro. Marcar
-- como concluída sem conferir esconderia uma tabela pela metade — e o erro
-- só apareceria meses depois, como lentidão ou lixo sem dono.
--
-- Então cada passo é refeito de forma que não reclama se já estiver lá. O
-- que existe é ignorado; o que faltou é criado. Só depois a linha é dada
-- por encerrada.
--
-- ── Como rodar ───────────────────────────────────────────────────────────
--
-- Vercel → Storage → neon-sky-cave → Query, com o **Read-only DESLIGADO**.
--
-- UM COMANDO POR VEZ. O editor da Vercel recusa vários de uma vez com
-- "cannot insert multiple commands into a prepared statement" — ele manda
-- tudo como uma única instrução preparada. Cole um, aperte Run, repita.
--
-- Pode rodar de novo quantas vezes quiser: nada aqui estraga se repetir.
--
-- ── Conferido antes de ser usado ─────────────────────────────────────────
--
-- Em 13/11/2026 isto foi rodado contra um Postgres descartável, em quatro
-- cenários:
--
--   1. tabela nua (migração parou no 1º passo) → ficou idêntica, campo por
--      campo, a um banco onde a migração rodou inteira;
--   2. tudo já no lugar → rodar de novo não mudou nada;
--   3. o erro P3009 reproduzido com as mesmas duas linhas duplicadas →
--      depois dos comandos, `prisma migrate status` respondeu
--      "Database schema is up to date!";
--   4. uma migração NOVA aplicada em cima → entrou sem reclamar, que é o
--      que o próximo deploy vai precisar fazer.

-- ── 1 ────────────────────────────────────────────────────────────────────
create index if not exists "meta_acoes_clientId_criadoEm_idx"
  on "meta_acoes" ("clientId", "criadoEm");

-- ── 2 ────────────────────────────────────────────────────────────────────
create index if not exists "meta_acoes_objetoId_criadoEm_idx"
  on "meta_acoes" ("objetoId", "criadoEm");

-- ── 3 ────────────────────────────────────────────────────────────────────
-- O Postgres não tem "if not exists" para chave estrangeira. Então: derruba
-- se houver, cria em seguida — no MESMO comando, senão ficaria um instante
-- sem a chave. Dá no mesmo tendo ela ou não.
alter table "meta_acoes"
  drop constraint if exists "meta_acoes_clientId_fkey",
  add constraint "meta_acoes_clientId_fkey"
    foreign key ("clientId") references "clients"("id")
    on delete cascade on update cascade;

-- ── 4 ────────────────────────────────────────────────────────────────────
alter table "meta_acoes"
  drop constraint if exists "meta_acoes_quemId_fkey",
  add constraint "meta_acoes_quemId_fkey"
    foreign key ("quemId") references "users"("id")
    on delete set null on update cascade;

-- ── 5 ────────────────────────────────────────────────────────────────────
-- Agora sim: encerrar a linha no cartório do Prisma.
--
-- Como as duas implantações rodaram juntas, há provavelmente DUAS linhas
-- para esta migração — uma encerrada e uma pendurada. O `finished_at is
-- null` pega só a pendurada e não mexe na que deu certo. O Prisma considera
-- quebrada qualquer linha sem `finished_at` e sem `rolled_back_at`.
update "_prisma_migrations"
set finished_at = now(),
    rolled_back_at = null,
    applied_steps_count = 5,
    logs = null
where migration_name = '20261113100026_meta_acoes'
  and finished_at is null;

-- ── 6 ────────────────────────────────────────────────────────────────────
-- A prova. Tem que voltar VAZIO.
--
-- Se sobrar qualquer linha aqui, há outra migração quebrada além desta e o
-- build vai continuar falhando — o nome que aparecer é o próximo a tratar.
select migration_name, started_at
from "_prisma_migrations"
where finished_at is null and rolled_back_at is null;
