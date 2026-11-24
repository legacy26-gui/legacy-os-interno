import { requireModuleAccess } from "@/lib/dal";
import { gastosDoMes } from "@/lib/financeiro-ia/painel";
import { GastosDoMesTela } from "../gastos-do-mes";

// Os gastos PESSOAIS de quem está olhando — e só dele.
//
// Decisão do Guilherme: "só eu vejo". A trava é a consulta (`donoId` = quem está
// logado), não um esconder de tela: outro ADMIN que abrir esta página vê a dele,
// vazia, e nunca a do Guilherme. No DRE da empresa a equipe vê só o TOTAL das
// retiradas, sem o detalhe.

export const dynamic = "force-dynamic";

export default async function GastosPessoaisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireModuleAccess("financeiro");
  const { month } = await searchParams;
  const ref = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : new Date();

  const dados = await gastosDoMes({ tipo: "pessoal", donoId: user.id }, ref);
  return (
    <GastosDoMesTela
      dados={dados}
      titulo="Gastos pessoais"
      subtitulo="Só você vê esta página · no DRE da empresa entram como retirada"
      caminho="/financeiro/pessoal"
      tipo="pessoal"
      vazio="Nenhum gasto pessoal neste mês. No grupo financeiro, escreva o gasto com a palavra pessoal: gasolina 200 pessoal."
    />
  );
}
