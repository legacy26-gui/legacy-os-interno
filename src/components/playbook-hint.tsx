import Link from "next/link";
import { Lightbulb } from "lucide-react";

export function PlaybookHint({ playbooks }: { playbooks: { id: string; title: string }[] }) {
  if (playbooks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
      <Lightbulb size={13} className="text-accent shrink-0" />
      <span className="text-foreground-muted">Playbook relacionado:</span>
      {playbooks.map((p) => (
        <Link key={p.id} href={`/playbooks/${p.id}`} className="font-medium text-accent hover:underline">
          {p.title}
        </Link>
      ))}
    </div>
  );
}
