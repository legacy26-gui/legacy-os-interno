import { Trash2, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatDate } from "@/lib/labels";
import { deleteContentItem } from "@/lib/actions/content";
import { ContentForm } from "./content-form";
import { ContentStatusSelect } from "./content-status-select";

export default async function MarketingPage() {
  await requireModuleAccess("marketing");

  const [items, clients] = await Promise.all([
    prisma.contentItem.findMany({
      include: { client: { select: { companyName: true } } },
      orderBy: [{ scheduledDate: "asc" }],
    }),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Marketing</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Calendário de conteúdo e banco de criativos</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <ContentForm clients={clients} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.length === 0 && (
          <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center md:col-span-2 xl:col-span-3">
            Nenhum conteúdo planejado ainda.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{item.title}</p>
                <p className="text-xs text-foreground-muted">{item.client?.companyName ?? "Interno"}</p>
              </div>
              <form action={deleteContentItem.bind(null, item.id)}>
                <button type="submit" className="p-1 rounded hover:bg-red-500/10 text-red-500 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
            {item.description && <p className="text-sm text-foreground-muted line-clamp-2">{item.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {item.platforms.map((p) => (
                <span key={p} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-muted text-foreground-muted capitalize">
                  {p}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-foreground-muted">{item.scheduledDate ? formatDate(item.scheduledDate) : "Sem data"}</span>
              <ContentStatusSelect itemId={item.id} status={item.status} />
            </div>
            {item.mediaUrl && (
              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent flex items-center gap-1 hover:underline">
                Ver material <ExternalLink size={11} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
