import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";
import { deleteEmployee } from "@/lib/actions/employees";
import { EmployeeForm } from "./employee-form";
import { VacationForm } from "./vacation-form";

export default async function EquipePage() {
  await requireModuleAccess("equipe");

  const employees = await prisma.employee.findMany({
    include: { vacations: { orderBy: { startDate: "desc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Equipe</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Colaboradores da Legacy Digital</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <EmployeeForm />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {employees.length === 0 && (
          <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center md:col-span-2">
            Nenhum colaborador cadastrado.
          </p>
        )}
        {employees.map((e) => (
          <div key={e.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-sm text-foreground-muted">{e.position}</p>
              </div>
              <form action={deleteEmployee.bind(null, e.id)}>
                <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500">
                  <Trash2 size={15} />
                </button>
              </form>
            </div>
            <div className="text-sm text-foreground-muted flex flex-wrap gap-x-4 gap-y-1">
              <span>Salário: {formatCurrency(e.salary.toString())}</span>
              <span>Admissão: {formatDate(e.hiredAt)}</span>
            </div>
            {e.notes && <p className="text-sm text-foreground-muted">{e.notes}</p>}

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <p className="text-xs uppercase text-foreground-muted font-medium">Férias</p>
              {e.vacations.length === 0 ? (
                <p className="text-xs text-foreground-muted">Nenhum período registrado.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {e.vacations.map((v) => (
                    <p key={v.id} className="text-xs">
                      {formatDate(v.startDate)} até {formatDate(v.endDate)}
                    </p>
                  ))}
                </div>
              )}
              <VacationForm employeeId={e.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
