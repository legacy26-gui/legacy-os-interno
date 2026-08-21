import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (user.mustChangePassword) {
    redirect("/trocar-senha");
  }

  return (
    // h-dvh em vez de h-screen: no celular a altura útil muda quando a barra do
    // navegador aparece/desaparece, e h-screen (100vh) deixava a tela cortada.
    <div className="flex flex-1 h-dvh bg-background overflow-hidden">
      <Sidebar role={user.role} email={user.email} />
      <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden">
        <Topbar name={user.name} role={user.role} />
        {/* O padding de baixo reserva a barra de gestos do celular, senão o
            último botão da tela fica embaixo dela. */}
        <main className="flex-1 p-4 md:p-8 pb-[calc(1rem_+_env(safe-area-inset-bottom,0px))] md:pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
