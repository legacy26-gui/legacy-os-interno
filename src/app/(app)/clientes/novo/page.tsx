import Link from "next/link";
import { ClipboardPen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { ClientForm } from "../client-form";
import { createClient } from "@/lib/actions/clients";
import type { ClientModel as Client } from "@/generated/prisma/models";

// Separa "Cascavel/PR" ou "Cascavel - PR" em cidade e UF, do jeito que o
// cliente escreveu no formulário.
function separaCidadeUf(valor: string | null | undefined): { city: string; state: string } {
  if (!valor) return { city: "", state: "" };
  const m = valor.match(/^(.*?)[\s]*[/\-–][\s]*([A-Za-z]{2})\s*$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return { city: valor.trim(), state: "" };
}

export default async function NovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const { ficha: fichaId } = await searchParams;

  // Veio do formulário de entrada: já abre com o que o cliente respondeu.
  const ficha =
    fichaId && canAccessModule(user.role, "formularios", user.email)
      ? await prisma.clientOnboarding.findUnique({ where: { id: fichaId } })
      : null;

  const respostas = (ficha?.answers ?? {}) as Record<string, string | string[]>;
  const { city, state } = separaCidadeUf(ficha?.city);

  // O formulário só lê alguns campos do cliente; o resto fica em branco.
  const prefill = ficha
    ? ({
        companyName: ficha.companyName,
        contactName: ficha.contactName,
        phone: ficha.phone ?? "",
        whatsapp: ficha.phone ?? "",
        email: ficha.email ?? "",
        city,
        state,
        cnpj: typeof respostas.cnpj === "string" ? respostas.cnpj : "",
      } satisfies Partial<Client>)
    : undefined;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Novo Cliente</h1>

      {ficha && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mb-4 flex items-center justify-between gap-3">
          <p className="text-sm flex items-center gap-2">
            <ClipboardPen size={15} className="text-accent shrink-0" />
            Dados vindos do formulário de <strong>{ficha.companyName}</strong>. Confira e complete o que falta.
          </p>
          <Link href="/formularios" className="text-xs text-accent hover:underline shrink-0">
            Ver ficha
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <ClientForm
          action={createClient}
          canSeeValues={canAccessModule(user.role, "financeiro")}
          client={prefill}
          hiddenFields={ficha ? { fichaId: ficha.id } : undefined}
        />
      </div>
    </div>
  );
}
