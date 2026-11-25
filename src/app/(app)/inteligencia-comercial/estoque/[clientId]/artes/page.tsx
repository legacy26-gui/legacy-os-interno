import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Images } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { escopoDaCarteira } from "@/lib/carteira";
import { nomeDaProporcao } from "@/lib/estoque/artes-puro";
import { BancoDeArtes } from "./banco";

// O banco de artes de uma loja: as artes que o designer fez, cada uma ligada ao seu carro.
// A arte é SEMPRE a 1ª foto do anúncio, e a proporção dela vale pro anúncio todo.

export const dynamic = "force-dynamic";

export default async function ArtesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requireModuleAccess("gestao-contas");
  const { clientId } = await params;
  const loja = await prisma.client.findFirst({ where: { id: clientId, ...escopoDaCarteira(user) }, select: { id: true, companyName: true } });
  if (!loja) notFound();
  const [artes, carros] = await Promise.all([
    prisma.arteDoCarro.findMany({ where: { clientId }, select: { id: true, nome: true, carroId: true, largura: true, altura: true, criadoEm: true }, orderBy: { criadoEm: "desc" } }),
    prisma.estoqueCarro.findMany({ where: { clientId, sumiuEm: null }, select: { id: true, titulo: true }, orderBy: { titulo: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <Link href="/inteligencia-comercial/estoque" className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft size={14} /> Estoque
      </Link>
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Images size={22} /> Banco de artes — {loja.companyName}
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          A arte do carro entra sempre como a <strong>1ª foto</strong> do anúncio, e as fotos do site são cortadas na <strong>proporção dela</strong>. Vale na campanha do zero e no
          &quot;anunciar agora&quot;. Dica: dê ao arquivo o nome do carro (ex.: <code>compass limited 2022.png</code>) que o sistema já liga sozinho.
        </p>
      </div>
      <BancoDeArtes
        clientId={clientId}
        carros={carros}
        artes={artes.map((a) => ({ id: a.id, nome: a.nome, carroId: a.carroId, proporcao: nomeDaProporcao(a.largura, a.altura) }))}
      />
    </div>
  );
}
