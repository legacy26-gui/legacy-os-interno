import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { veTodasAsEmpresas } from "@/lib/empresa";
import { CARTEIRA } from "@/lib/carteira";
import {
  verEstadoDaLigacao,
  verEnderecoDoWebhook,
  verEnvioAutomatico,
} from "@/lib/actions/whatsapp";
import { VARIAVEIS_DA_ZAPI } from "@/lib/whatsapp/ligacao";
import { PainelDoWhatsapp } from "./painel";

// A tela de ligar o WhatsApp.
//
// ── Por que ela existe, e por que agora ───────────────────────────────────
//
// O Guilherme vai pegar um chip e ativar o plano da Z-API. Sem esta tela, o
// que o esperava depois disso era: colar três variáveis na Vercel sem
// retorno nenhum, abrir o painel da Z-API, copiar o id de cada grupo à mão,
// colar um por um na ficha de cada loja, e descobrir se funcionou mandando
// relatório pro grupo de um cliente de verdade.
//
// Agora é: colar as três variáveis, abrir esta tela, ver "conectado" com o
// número na frente, escolher o grupo de cada loja numa lista, e mandar um
// teste pro próprio telefone antes de qualquer cliente receber nada.
//
// ── Por que não dá pra eu preencher as variáveis ─────────────────────────
//
// Porque elas são segredo e vivem na Vercel, onde eu não entro. O que a tela
// faz é a próxima melhor coisa: dizer QUAL está faltando, pelo nome exato, e
// onde achar o valor. Sem isso, "não configurado" é um beco sem saída.

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") redirect("/dashboard?erro=acesso-negado");
  if (!veTodasAsEmpresas(user.empresas)) redirect("/dashboard?erro=so-grupo");

  const [estado, webhook, envioAutomatico] = await Promise.all([
    verEstadoDaLigacao(),
    verEnderecoDoWebhook(),
    verEnvioAutomatico(),
  ]);

  const lojas = await prisma.client.findMany({
    where: CARTEIRA,
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      whatsappGrupoId: true,
      whatsappDesligaAuto: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/configuracoes"
          className="text-sm text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 w-fit"
        >
          <ArrowLeft size={14} /> Configurações
        </Link>
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-foreground-muted">
          A ligação pela Z-API: o número do robô, os grupos das lojas e um
          teste antes de qualquer cliente receber alguma coisa.
        </p>
      </div>

      <PainelDoWhatsapp
        estado={estado}
        variaveis={[...VARIAVEIS_DA_ZAPI]}
        webhook={webhook}
        envioAutomatico={envioAutomatico}
        lojas={lojas.map((l) => ({
          id: l.id,
          nome: l.companyName,
          grupoId: l.whatsappGrupoId,
          desligaAuto: l.whatsappDesligaAuto,
        }))}
      />
    </div>
  );
}
