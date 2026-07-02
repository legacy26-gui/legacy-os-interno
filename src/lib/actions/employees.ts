"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const EmployeeSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  position: z.string().min(2, "Informe a função."),
  salary: z.coerce.number().min(0, "Valor inválido."),
  hiredAt: z.string().min(1, "Informe a data de admissão."),
  notes: z.string().optional(),
});

export type EmployeeFormState = { error?: string } | undefined;

export async function createEmployee(_prevState: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  await requireModuleAccess("rh");
  const parsed = EmployeeSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position"),
    salary: formData.get("salary"),
    hiredAt: formData.get("hiredAt"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { hiredAt, ...rest } = parsed.data;
  await prisma.employee.create({ data: { ...rest, hiredAt: new Date(hiredAt) } });
  revalidatePath("/rh");
}

export async function deleteEmployee(employeeId: string) {
  await requireModuleAccess("rh");
  await prisma.employee.delete({ where: { id: employeeId } });
  revalidatePath("/rh");
}

const VacationSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional(),
});

export type VacationFormState = { error?: string } | undefined;

export async function addVacation(
  employeeId: string,
  _prevState: VacationFormState,
  formData: FormData
): Promise<VacationFormState> {
  await requireModuleAccess("rh");
  const parsed = VacationSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.vacation.create({
    data: {
      employeeId,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      notes: parsed.data.notes,
    },
  });
  revalidatePath("/rh");
}
