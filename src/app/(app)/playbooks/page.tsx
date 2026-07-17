import Link from "next/link";
import { Plus, Search, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

export default async function PlaybooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const user = await requireModuleAccess("playbooks");
  const { q, tag } = await searchParams;
  const canEdit = user.role !== "GESTOR_TRAFEGO";

  const playbooks = await prisma.playbook.findMany({
    where: {
      AND: [
        q ? { title: { contains: q, mode: "insensitive" } } : {},
        tag ? { tags: { has: tag } } : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  const allTags = await prisma.playbook.findMany({ select: { tags: true } });
  const tagCounts = new Map<string, number>();
  for (const p of allTags) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen size={20} className="text-accent" /> Playbooks
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Base de consulta obrigatória — sempre que tiver dúvida, é aqui que a resposta está.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/playbooks/novo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity self-start"
          >
            <Plus size={16} />
            Novo Playbook
          </Link>
        )}
      </div>

      {sortedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedTags.map(([t, count]) => (
            <Link
              key={t}
              href={tag === t ? "/playbooks" : `/playbooks?tag=${encodeURIComponent(t)}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tag === t ? "bg-accent text-white border-accent" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {t} <span className="opacity-70">({count})</span>
            </Link>
          ))}
        </div>
      )}

      <form className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por título..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {tag && <input type="hidden" name="tag" value={tag} />}
      </form>

      {playbooks.length === 0 ? (
        <div className="text-center py-16 text-foreground-muted rounded-2xl border border-border bg-surface">
          <p className="font-medium">Nenhum playbook encontrado</p>
          {canEdit && <p className="text-sm mt-1">Crie o primeiro pra começar a base de consulta da equipe.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playbooks.map((p) => (
            <Link
              key={p.id}
              href={`/playbooks/${p.id}`}
              className="rounded-2xl border border-border bg-surface p-5 hover:border-accent transition-colors flex flex-col gap-3"
            >
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-foreground-muted line-clamp-3">{p.content}</p>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-foreground-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
