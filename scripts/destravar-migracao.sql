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
-- O Prisma então se recusa a aplicar qualquer migração nova — e está certo:
-- construir em cima de uma migração quebrada é construir em cima de parede
-- torta. A causa já foi removida em `scripts/migrar.mjs` (só produção migra).
-- Este arquivo limpa o que ficou para trás.
--
-- ── Por que não é só "marcar como aplicada" ──────────────────────────────
--
-- A migração tem cinco passos: a tabela, dois índices e duas chaves
-- estrangeiras. A implantação que falhou pode ter parado no primeiro. Marcar
-- como concluída sem conferir esconderia uma tabela pela metade — e o erro
-- só apareceria meses depois, como lentidão ou lixo sem dono.
--
-- Então cada passo é refeito com "se não existir". O que já está lá é
-- ignorado; o que faltou é criado. Só depois a linha é dada por encerrada.
--
-- Rode no Query da Vercel (Storage → neon-sky-cave), com o botão
-- **Read-only DESLIGADO**. Pode rodar mais de uma vez sem estragar nada.

-- 1. Os dois índices. `if not exists` resolve sozinho.
create index if not exists "meta_acoes_clientId_criadoEm_idx"
  on "meta_acoes" ("clientId", "criadoEm");

create index if not exists "meta_acoes_objetoId_criadoEm_idx"
  on "meta_acoes" ("objetoId", "criadoEm");

-- 2. As duas chaves estrangeiras. O Postgres não tem "if not exists" para
--    constraint, então: derruba se houver, cria de novo. Fica igual nos dois
--    casos (já existia ou faltava), e é SQL simples — sem bloco `do $$`, que
--    alguns editores de consulta recortam errado na hora de colar.
alter table "meta_acoes" drop constraint if exists "meta_acoes_clientId_fkey";
alter table "meta_acoes" add constraint "meta_acoes_clientId_fkey"
  foreign key ("clientId") references "clients"("id")
  on delete cascade on update cascade;

alter table "meta_acoes" drop constraint if exists "meta_acoes_quemId_fkey";
alter table "meta_acoes" add constraint "meta_acoes_quemId_fkey"
  foreign key ("quemId") references "users"("id")
  on delete set null on update cascade;

-- 3. Agora sim: encerrar a linha no cartório do Prisma.
--
--    Como as duas implantações rodaram juntas, pode haver DUAS linhas para
--    esta migração. As duas são tratadas: o Prisma considera quebrada
--    qualquer linha sem `finished_at` e sem `rolled_back_at`.
update "_prisma_migrations"
set finished_at = now(),
    rolled_back_at = null,
    applied_steps_count = 5,
    logs = null
where migration_name = '20261113100026_meta_acoes'
  and finished_at is null;

-- 4. A prova. Tem que voltar VAZIO.
--
--    Se sobrar qualquer linha aqui, há outra migração quebrada além desta e
--    o build vai continuar falhando — aí me mande o nome que aparecer.
select migration_name, started_at
from "_prisma_migrations"
where finished_at is null and rolled_back_at is null;
