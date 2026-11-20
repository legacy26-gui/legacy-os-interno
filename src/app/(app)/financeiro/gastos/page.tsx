import { requireModuleAccess } from "@/lib/dal";
import { empresaAtual } from "@/lib/empresa-atual";
import { gastosDoMes } from "@/lib/financeiro-ia/painel";
import { GastosDoMesTela } from "../gastos-do-mes";

// Gastos da EMPRESA por categoria: a mesma régua do DRE (só saída confirmada),
// vista como "pra onde foi o dinheiro". Inclui o que foi lançado na tela e o que
// o robô lançou pelo grupo financeiro.

export const dynamic = "force-dynamic";

export default async function GastosDaEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  const { month } = await searchParams;
  const ref = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : new Date();

  const dados = await gastosDoMes({ tipo: "empresa", empresa }, ref);
  return (
    <GastosDoMesTela
      dados={dados}
      titulo={`Gastos da empresa — ${empresa === "TREINAMENTOS" ? "Treinamentos" : "Agência"}`}
      subtitulo="Pra onde foi o dinheiro da empresa"
      caminho="/financeiro/gastos"
      vazio="Nenhuma saída confirmada neste mês. Lance pela aba Entradas e saídas ou mande no grupo financeiro do WhatsApp."
    />
  );
}
