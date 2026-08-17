import { WifiOff } from "lucide-react";

export const metadata = { title: "Sem conexão — Legacy OS" };

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-foreground-muted">
        <WifiOff size={24} />
      </div>
      <div>
        <h1 className="text-lg font-semibold">Sem conexão</h1>
        <p className="text-sm text-foreground-muted mt-1 max-w-xs">
          O Legacy OS precisa de internet para mostrar dados atualizados. Verifique sua conexão e tente de novo.
        </p>
      </div>
      <a
        href="/meu-dia"
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90"
      >
        Tentar de novo
      </a>
    </div>
  );
}
