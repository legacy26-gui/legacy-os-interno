import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina de correção pontual: uma tentativa de deploy anterior deixou uma
// advisory lock do Postgres presa (usada internamente pelo `prisma migrate
// deploy` pra evitar migrations concorrentes), fazendo todo deploy seguinte
// falhar com P1002 (timeout esperando a lock). Encerra a conexão que está
// com a lock presa, sem tocar em nenhum dado.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const locks = await prisma.$queryRawUnsafe<{ pid: number; granted: boolean }[]>(
    `SELECT pid, granted FROM pg_locks WHERE locktype = 'advisory'`
  );

  const activity = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT pid, state, query, query_start, backend_start, backend_type
     FROM pg_stat_activity
     WHERE pid = ANY(SELECT pid FROM pg_locks WHERE locktype = 'advisory')`
  );

  const terminated = await prisma.$queryRawUnsafe<{ pid: number; terminated: boolean }[]>(
    `SELECT pid, pg_terminate_backend(pid) AS terminated
     FROM pg_stat_activity
     WHERE pid = ANY(SELECT pid FROM pg_locks WHERE locktype = 'advisory')
       AND pid <> pg_backend_pid()`
  );

  return NextResponse.json({ locksBefore: locks, activity, terminated });
}
