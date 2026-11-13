import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { Voltar } from "@/components/voltar";
import { FormularioDaArte } from "./formulario";

export const dynamic = "force-dynamic";

export default async function NovaArtePage() {
  const user = await requireModuleAccess("studio");

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      studioMarca: { select: { clientId: true } },
    },
  });

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div>
        <Voltar href="/studio">Legacy Studio</Voltar>
        <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
          <Sparkles size={20} className="text-accent" /> Nova arte
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          A foto e os dados do carro. Feed e Stories saem dos dois de uma vez.
        </p>
      </div>

      <FormularioDaArte
        lojas={lojas.map((l) => ({
          id: l.id,
          nome: l.companyName,
          temMarca: !!l.studioMarca,
        }))}
      />
    </div>
  );
}
