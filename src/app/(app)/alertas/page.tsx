import Link from "next/link";
import { BellRing, CheckCircle2, ArrowRight, BellOff, Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/dal";
import { meusAlertas, alertasDaEquipe, ultimaConferencia } from "@/lib/alertas/robo";
import { ehODono } from "@/lib/alertas/destinatarios";
import { veTodasAsEmpresas, EMPRESA_CURTA } from "@/lib/empresa";
import {
  ROTULO_DO_TIPO,
  TOM_POR_NIVEL,
  ESTILO_DO_TOM,
  ESTILO_DO_SELO,
  ESTILO_SECUNDARIO,
  TIPOS_DE_ALERTA,
  type AlertaNaTela,
} from "@/lib/alertas/tipos";
import { AcoesDoAlerta, RodarAgora, MarcarVistos } from "./acoes";

// A central de alertas.
//
// A tela responde uma pergunta só: o que precisa da minha ação hoje? Por isso
// é uma lista do pior pro menos pior, e não um painel com números — número
// bonito não faz ninguém levantar e resolver nada.
//
// Cada alerta tem link pro lugar onde se resolve. Alerta sem caminho de
// resolver é só reclamação.
//
// Não existe botão de "dispensar". Ver src/lib/actions/alertas.ts.

export const metadata = { title: "Alertas" };

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  // Sem requireModuleAccess de propósito: todo mundo tem a própria central, e
  // o que entra nela já passou pelas quatro travas de destinatarios.ts. Quem
  // não é dono de alerta nenhum simplesmente vê a tela vazia — que é a
  // verdade, não um erro.
  const user = await getCurrentUser();
  const { ver } = await searchParams;

  // `ehODono` e não "é ADMIN": o sócio do Legacy Treinamentos também é ADMIN
  // no sistema, e nem a aba da equipe nem o botão que dispara o robô são dele.
  const souDono = ehODono(user);
  const vendoEquipe = souDono && ver === "equipe";
  const [{ ativos, silenciados }, conferidoEm] = await Promise.all([
    vendoEquipe ? alertasDaEquipe() : meusAlertas(),
    ultimaConferencia(),
  ]);

  const mostrarEmpresa = veTodasAsEmpresas(user.empresas);
  const porTipo = TIPOS_DE_ALERTA.map((t) => ({
    tipo: t,
    quantos: ativos.filter((a) => a.tipo === t).length,
  })).filter((x) => x.quantos > 0);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BellRing size={20} className="text-accent" /> Alertas
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {ativos.length === 0
              ? "Nada pendente pra você agora"
              : `${ativos.length} ${ativos.length === 1 ? "coisa pedindo ação" : "coisas pedindo ação"} — ${user.name.split(" ")[0]}`}
          </p>
        </div>
        {souDono && <RodarAgora />}
      </div>

      {souDono && (
        // O dono pode acompanhar o que a equipe está vendo sem receber no
        // celular: ver não é o mesmo que ser avisado.
        <div className="flex gap-1 p-1 rounded-xl bg-surface-muted/60 w-fit">
          {[
            { chave: "", rotulo: "Meus alertas" },
            { chave: "equipe", rotulo: "Da equipe" },
          ].map((aba) => {
            const ativa = (ver ?? "") === aba.chave;
            return (
              <Link
                key={aba.chave}
                href={aba.chave ? "/alertas?ver=equipe" : "/alertas"}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  ativa ? "bg-surface shadow-sm font-medium" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {aba.rotulo}
              </Link>
            );
          })}
        </div>
      )}

      {porTipo.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {porTipo.map(({ tipo, quantos }) => (
            <span
              key={tipo}
              className="text-xs px-2.5 py-1 rounded-full bg-surface-muted border border-border text-foreground-muted"
            >
              {quantos} × {ROTULO_DO_TIPO[tipo]}
            </span>
          ))}
        </div>
      )}

      {ativos.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-muted/40 p-8 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
          <p className="mt-3 font-medium">Tudo em ordem</p>
          <p className="text-sm text-foreground-muted mt-1">
            Nenhuma gravação atrasada, nenhuma loja parada, nada vencido.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ativos.map((a) => (
            <Cartao key={a.chave} alerta={a} mostrarEmpresa={mostrarEmpresa} />
          ))}
        </div>
      )}

      {silenciados.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-2 flex items-center gap-1.5">
            <BellOff size={13} /> Pra lembrar depois ({silenciados.length})
          </p>
          <div className="flex flex-col gap-2.5 opacity-60">
            {silenciados.map((a) => (
              <Cartao key={a.chave} alerta={a} mostrarEmpresa={mostrarEmpresa} />
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-foreground-muted">
        <p>
          Os alertas são conferidos sozinhos uma vez por dia, de manhã, e o
          aviso vai pro celular de quem é dono do assunto. Um alerta só sai
          daqui quando o problema é resolvido no sistema — não existe botão de
          dispensar, pra a tela nunca dizer que está tudo em ordem quando não
          está.
        </p>
        {/* Mostrar quando o robô passou tira a dúvida de "será que isso está
            funcionando?" sem ninguém precisar perguntar. */}
        <p className="mt-1">
          {conferidoEm
            ? `Última conferência automática: ${conferidoEm.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              })}.`
            : "A conferência automática ainda não rodou nenhuma vez."}
        </p>
      </div>

      {/* Abriu a tela, viu: tira o "novo" e cala o aviso de canto. */}
      <MarcarVistos temNovos={[...ativos, ...silenciados].some((a) => a.novo)} />
    </div>
  );
}

function Cartao({ alerta, mostrarEmpresa }: { alerta: AlertaNaTela; mostrarEmpresa: boolean }) {
  const tom = TOM_POR_NIVEL[alerta.nivel];
  const critico = tom === "critico";

  return (
    <div className={`rounded-xl border p-3.5 ${ESTILO_DO_TOM[tom]}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTILO_DO_SELO[tom]}`}>
              {ROTULO_DO_TIPO[alerta.tipo]}
            </span>
            {mostrarEmpresa && (
              <span className={`text-[11px] ${ESTILO_SECUNDARIO[tom]}`}>
                {EMPRESA_CURTA[alerta.empresa]}
              </span>
            )}
            {alerta.novo && !alerta.silenciado && (
              <span className={`text-[11px] font-medium ${critico ? "text-white" : "text-accent"}`}>
                novo
              </span>
            )}
          </div>
          <p className="font-medium mt-1.5 leading-5">{alerta.titulo}</p>
          {alerta.detalhe && (
            <p className={`text-xs mt-0.5 ${ESTILO_SECUNDARIO[tom]}`}>{alerta.detalhe}</p>
          )}
          {alerta.silenciado && alerta.silenciadoAte && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${ESTILO_SECUNDARIO[tom]}`}>
              <Clock size={11} /> guardado até {alerta.silenciadoAte}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AcoesDoAlerta
            chave={alerta.chave}
            silenciado={alerta.silenciado}
            critico={critico}
            podeAdiar={alerta.podeAdiar}
          />
          <Link
            href={alerta.link}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors ${
              critico ? "bg-white text-red-700 hover:bg-red-50" : "bg-accent/15 text-accent hover:bg-accent/25"
            }`}
          >
            Resolver <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
