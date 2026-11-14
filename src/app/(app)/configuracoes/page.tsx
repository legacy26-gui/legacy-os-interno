import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/permissions";
import { EMPRESAS, EMPRESA_LABELS, empresasPermitidas, veTodasAsEmpresas } from "@/lib/empresa";
import { UserForm } from "./user-form";
import { UserRowActions } from "./user-row-actions";
import { EmpresasDoUsuario } from "./empresas-do-usuario";

export default async function ConfiguracoesPage() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") redirect("/dashboard?erro=acesso-negado");
  // Cargo de administrador não basta: quem não enxerga o grupo inteiro não
  // administra usuário, porque administrar usuário é distribuir acesso a
  // empresa — inclusive pra si mesmo.
  if (!veTodasAsEmpresas(user.empresas)) redirect("/dashboard?erro=so-grupo");

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Gestão de usuários, níveis de acesso e empresas do grupo
        </p>
      </div>

      {/* As ligações com serviços de fora moram aqui porque é a tela que já
          é só da direção. Um link e não um bloco: quem abre Configurações
          vem quase sempre mexer em usuário, e o WhatsApp é coisa de ligar
          uma vez e esquecer. */}
      <Link
        href="/configuracoes/whatsapp"
        className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-3
          hover:border-border-forte transition-colors"
      >
        <MessageCircle size={18} className="text-accent shrink-0" />
        <span className="flex-1">
          <span className="font-medium block">WhatsApp</span>
          <span className="text-sm text-foreground-muted">
            A ligação pela Z-API: número do robô, grupo de cada loja e teste
            de envio
          </span>
        </span>
        <ChevronRight size={18} className="text-foreground-muted shrink-0" />
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <UserForm />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium hidden sm:table-cell">E-mail</th>
              <th className="px-5 py-3 font-medium">Nível</th>
              <th className="px-5 py-3 font-medium">Empresas</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3 font-medium">{u.name}</td>
                <td className="px-5 py-3 text-foreground-muted hidden sm:table-cell">{u.email}</td>
                <td className="px-5 py-3 text-foreground-muted">{ROLE_LABELS[u.role]}</td>
                <td className="px-5 py-3">
                  <EmpresasDoUsuario
                    userId={u.id}
                    empresas={EMPRESAS}
                    atuais={empresasPermitidas(u.empresas)}
                    rotulos={EMPRESA_LABELS}
                  />
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${u.active ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <UserRowActions userId={u.id} active={u.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
