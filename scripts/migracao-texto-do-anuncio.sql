-- Migração: guardar o texto e o post de antes e depois de uma edição.
--
-- ── Por que isto é um arquivo pra rodar na mão ──────────────────────────
--
-- Porque o build da Vercel é só `next build`: ele NÃO roda `prisma migrate
-- deploy`. Toda migração chega na produção por aqui, colada no editor de SQL
-- do banco. É o mesmo caminho da migração de 13/11.
--
-- ── Dá pra rodar a qualquer hora, inclusive com o site no ar ────────────
--
-- São quatro colunas novas, todas anuláveis e sem valor padrão. No Postgres
-- 11 pra cima isso é instantâneo: só mexe no catálogo, não reescreve as
-- linhas que já existem, e não segura a tabela. Não é o caso da migração
-- anterior, que travou porque mexia em índice.
--
-- É UM comando só, de propósito: o editor da Vercel recusa vários comandos
-- no mesmo envio ("cannot insert multiple commands into a prepared
-- statement"). Cole tudo e mande uma vez.
--
-- ── Uma dívida que isto cria, pra não surpreender depois ───────────────
--
-- Aplicando na mão, a produção fica com a coluna mas SEM a linha
-- correspondente na tabela `_prisma_migrations`. Pro sistema rodando não faz
-- diferença nenhuma. Faz no dia em que alguém apontar `prisma migrate
-- deploy` pra produção: ele vai tentar aplicar esta migração de novo e parar
-- com erro de coluna duplicada, porque o arquivo em
-- prisma/migrations/20261113232843_texto_do_anuncio/ não tem o
-- IF NOT EXISTS que este aqui tem.
--
-- Vale como mais um motivo pra, uma hora, pôr `prisma migrate deploy` no
-- build e parar de aplicar migração colando SQL.
--
-- ── Até rodar ───────────────────────────────────────────────────────────
--
-- O botão "Mudar o texto", na aba Anúncios, vai dar erro. Nada mais quebra:
-- nenhuma outra tela lê a tabela meta_acoes. Rodou, o botão passa a
-- funcionar na hora, sem precisar de novo deploy.

ALTER TABLE "meta_acoes"
  ADD COLUMN IF NOT EXISTS "textoAntes"  TEXT,
  ADD COLUMN IF NOT EXISTS "textoDepois" TEXT,
  ADD COLUMN IF NOT EXISTS "postAntes"   TEXT,
  ADD COLUMN IF NOT EXISTS "postDepois"  TEXT;

-- Pra conferir que entrou (rode depois, é outro comando):
--
-- select column_name from information_schema.columns
--  where table_name = 'meta_acoes' and column_name like '%texto%' or column_name like '%post%';
--
-- Tem que listar as quatro.
