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
    <div className="flex flex-1 h-screen bg-background overflow-hidden">
      <Sidebar role={user.role} />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Topbar name={user.name} role={user.role} />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
