import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, KeyRound } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { Voltar } from "@/components/voltar";
import { conferirEscrita } from "@/lib/meta/escrever-na-graph";

// "A chave da Meta entrou certo?"
//
// ── Por que esta tela existe ──────────────────────────────────────────────
//
// Porque antes a única resposta era passar o mouse numa chavinha e ver se ela
// destravava. Isso diz que a VARIÁVEL existe — e só. Não diz se o token tem o
// escopo certo, nem se ele alcança as contas das lojas. Os dois erros
// apareceriam no primeiro clique de verdade, numa campanha de verdade, que é
// o pior lugar pra descobrir.
//
// O caso silencioso mais comum é o terceiro: o token foi gerado direitinho,
// mas ninguém deu as contas de anúncio pro usuário do sistema. Aí TODA
// operação responde "não achei esse objeto", e a pessoa procura o erro no
// lugar errado por meia hora.
//
// ── O que ela nunca mostra ────────────────────────────────────────────────
//
// O token. Nem pedaço, nem o começo, nem o fim. A tela responde o que ele
// ALCANÇA, não o que ele é.

export const dynamic = "force-dynamic";

export default async function ConferirEscritaPage() {
  const user = await requireModuleAccess("clientes");
  // Só a direção: isto é configuração do sistema, não trabalho de loja.
  if (user.role !== "ADMIN" && user.role !== "GERENTE") redirect("/meta-ads");

  const c = await conferirEscrita();

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Voltar href="/meta-ads">Meta Ads</Voltar>

      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <KeyRound size={20} className="text-accent" /> A chave de escrita da Meta
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          O que o token configurado no sistema alcança hoje. Esta tela pergunta à Meta na hora e
          nunca mostra o token.
        </p>
      </div>

      {!c.configurado ? (
        <Cartao
          tom="ruim"
          titulo="Não há chave de escrita configurada"
          detalhe="Sem ela, ligar e desligar campanha pela tela fica travado — a chavinha só mostra como está."
        >
          <p className="text-sm text-foreground-muted">
            A variável se chama <Codigo>META_ADS_WRITE_TOKEN</Codigo> e vai nas variáveis de
            ambiente do projeto na Vercel, marcada em <strong>Production</strong>. Depois de salvar
            é preciso reimplantar pra ela entrar.
          </p>
        </Cartao>
      ) : !c.valido ? (
        <Cartao
          tom="ruim"
          titulo="A Meta não aceitou essa chave"
          detalhe="A variável existe, mas o token não vale. Em geral é token expirado, ou copiado pela metade."
        >
          {c.erro && <Frase>{c.erro}</Frase>}
          <p className="text-sm text-foreground-muted">
            Token de <strong>usuário do sistema</strong> não expira; o que o Explorer gera morre em
            poucas horas. Se o token veio de lá, é esse o motivo.
          </p>
        </Cartao>
      ) : (
        <>
          <Cartao tom="bom" titulo="A Meta reconheceu a chave" detalhe={null} />

          <Cartao
            tom={c.contas === null ? "atencao" : c.contas === 0 ? "ruim" : "bom"}
            titulo={
              c.contas === null
                ? "Não deu pra listar as contas"
                : c.contas === 0
                  ? "Esta chave não alcança nenhuma conta de anúncio"
                  : `Alcança ${c.contas} ${c.contas === 1 ? "conta de anúncio" : "contas de anúncio"}`
            }
            detalhe={
              c.contas === 0
                ? "É o erro silencioso mais comum: o token foi gerado, mas ninguém deu as contas pro usuário do sistema. Assim, toda operação responde “não achei esse objeto”."
                : null
            }
          >
            {c.contas === 0 && (
              <p className="text-sm text-foreground-muted">
                No Gerenciador do negócio: <strong>Usuários do sistema</strong> → o usuário →{" "}
                <strong>Adicionar ativos</strong> → <strong>Contas de anúncio</strong> → marque as
                contas das lojas → permissão <strong>Gerenciar campanhas</strong>.
              </p>
            )}
            {c.erro && c.contas === null && <Frase>{c.erro}</Frase>}
          </Cartao>

          <Cartao
            tom={c.podeGerenciar === true ? "bom" : c.podeGerenciar === false ? "ruim" : "atencao"}
            titulo={
              c.podeGerenciar === true
                ? "Tem permissão de gerenciar campanhas"
                : c.podeGerenciar === false
                  ? "Falta a permissão ads_management"
                  : "Não deu pra confirmar as permissões por aqui"
            }
            detalhe={
              c.podeGerenciar === false
                ? "Sem ela o token lê os números mas não liga nem desliga nada."
                : c.podeGerenciar === null
                  ? "Nem todo tipo de token responde essa pergunta. Não é erro — só não dá pra confirmar o escopo por este caminho, e o teste real é ligar e desligar um anúncio dentro de uma campanha já pausada."
                  : null
            }
          >
            {c.permissoes && c.permissoes.length > 0 && (
              <p className="text-xs text-foreground-muted">
                Permissões concedidas: <Codigo>{c.permissoes.join(", ")}</Codigo>
              </p>
            )}
          </Cartao>
        </>
      )}

      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-medium">O primeiro teste de verdade</p>
        <p className="text-sm text-foreground-muted mt-1">
          Não numa campanha de cliente rodando. Procure uma loja com uma campanha{" "}
          <strong>já pausada</strong>, entre nela, e ligue e desligue um <strong>anúncio de
          dentro</strong> dessa campanha. Como a campanha está parada, nada entrega de qualquer
          jeito — mas a chamada vai pra Meta de verdade, e fica registrado quem mexeu, o que estava
          antes e o que a Meta respondeu.
        </p>
      </div>
    </div>
  );
}

function Cartao({
  tom,
  titulo,
  detalhe,
  children,
}: {
  tom: "bom" | "ruim" | "atencao";
  titulo: string;
  detalhe: string | null;
  children?: React.ReactNode;
}) {
  const Icone = tom === "bom" ? CheckCircle2 : tom === "ruim" ? XCircle : AlertTriangle;
  const cor =
    tom === "bom"
      ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
      : tom === "ruim"
        ? "border-red-500/60 bg-red-500/5 text-red-600 dark:text-red-400"
        : "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400";

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex flex-col gap-2 ${cor}`}>
      <p className="text-sm font-semibold flex items-start gap-2">
        <Icone size={16} className="shrink-0 mt-0.5" />
        {titulo}
      </p>
      {detalhe && <p className="text-sm text-foreground-muted">{detalhe}</p>}
      {children}
    </div>
  );
}

function Frase({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-mono break-words rounded-lg bg-surface-muted px-3 py-2 text-foreground">
      {children}
    </p>
  );
}

function Codigo({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}
