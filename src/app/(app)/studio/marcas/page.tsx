import { Palette } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { Voltar } from "@/components/voltar";
import { Marcas } from "./formulario";

export const dynamic = "force-dynamic";

export default async function MarcasPage() {
  const user = await requireModuleAccess("studio");
  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true, studioMarca: true },
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <Voltar href="/studio">Legacy Studio</Voltar>
        <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
          <Palette size={20} className="text-accent" /> Identidade das lojas
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Logo, cores e rodapé de cada loja. As artes já existentes passam a sair com isto —
          nenhuma precisa ser refeita.
        </p>
      </div>

      {!podeEditar && (
        <p className="text-xs text-foreground-muted">
          Só a direção edita a identidade visual. Você pode conferir como está.
        </p>
      )}

      <Marcas
        podeEditar={podeEditar}
        lojas={lojas.map((l) => ({
          clientId: l.id,
          nome: l.companyName,
          logoUrl: l.studioMarca?.logoUrl ?? null,
          corPrimaria: l.studioMarca?.corPrimaria ?? "#FFC20E",
          corFundo: l.studioMarca?.corFundo ?? "#0A0A0A",
          corTexto: l.studioMarca?.corTexto ?? "#FFFFFF",
          telefone: l.studioMarca?.telefone ?? "",
          endereco: l.studioMarca?.endereco ?? "",
        }))}
      />
    </div>
  );
}
