import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatDateTime } from "@/lib/labels";
import { deletePlaybook } from "@/lib/actions/playbooks";
import { DeletePlaybookButton } from "../delete-playbook-button";

export default async function PlaybookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleAccess("playbooks");
  const { id } = await params;
  const canEdit = user.role !== "GESTOR_TRAFEGO";

  const playbook = await prisma.playbook.findUnique({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  if (!playbook) notFound();

  const boundDelete = deletePlaybook.bind(null, playbook.id);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <Link href="/playbooks" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Playbooks
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{playbook.title}</h1>
              <p className="text-sm text-foreground-muted">
                {playbook.author?.name ?? "Sistema"} · atualizado em {formatDateTime(playbook.updatedAt)}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Link
                href={`/playbooks/${playbook.id}/editar`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border bg-surface rounded-lg text-sm hover:bg-surface-muted"
              >
                <Pencil size={14} /> Editar
              </Link>
              <DeletePlaybookButton action={boundDelete} title={playbook.title} />
            </div>
          )}
        </div>
      </div>

      {playbook.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {playbook.tags.map((t) => (
            <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-surface-muted text-foreground-muted">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{playbook.content}</p>
      </div>
    </div>
  );
}
