import { getCurrentUser } from "@/lib/dal";
import { ChangePasswordForm } from "./change-password-form";

export default async function TrocarSenhaPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">Olá, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Este é seu primeiro acesso. Defina uma nova senha para continuar.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
