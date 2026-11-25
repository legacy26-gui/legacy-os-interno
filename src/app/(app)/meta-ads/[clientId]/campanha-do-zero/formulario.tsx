"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, Trash2, Check, AlertTriangle, ExternalLink, Sparkles, Upload, X } from "lucide-react";
import { atribuirArte, subirArte } from "@/lib/actions/artes";
import { legendaDoModelo, MODELO_PADRAO } from "@/lib/meta/legenda-modelo";
import { criarAnuncioNoZero, criarEstruturaDoZero, legendaDoZero, listarNumeros, listarPaginas, type CarroDoZero } from "@/lib/actions/campanha-do-zero";
import { procurarLocais } from "@/lib/actions/publico-do-conjunto";
import { IDADE_MAXIMA, IDADE_MINIMA, RAIOS_DA_CIDADE, type GeneroDoPublico, type LocalDoPublico } from "@/lib/meta/publico-puro";

type Estado = "esperando" | "criando" | "ok" | "erro";
interface LinhaDoCarro {
  carro: CarroDoZero;
  marcado: boolean;
  /** Em "montar os conjuntos": em qual conjunto o carro vai. */
  conjunto: string;
  nome: string;
  legenda: string;
  estado: Estado;
  msg: string;
  /** Em "um conjunto por carro": o WhatsApp do conjunto deste carro ("" = o padrão da campanha). */
  whatsapp: string;
}

/**
 * Escolher o número do WhatsApp que recebe as conversas: os achados na Meta (página e portfólio), ou digitar outro.
 * "" = o padrão (da campanha, ou o da página).
 */
function SeletorDeNumero(p: { valor: string; mudar: (v: string) => void; numeros: { numero: string; nome: string }[]; vazio: string; rotulo: string; travado: boolean; pequeno?: boolean }) {
  const conhecido = p.valor === "" || p.numeros.some((n) => n.numero === p.valor);
  const [outro, setOutro] = useState(!conhecido);
  const fmt = (n: string) => (n.startsWith("55") && n.length >= 12 ? `(${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}` : `+${n}`);
  const cls = `rounded-lg border border-border bg-surface ${p.pequeno ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select
        aria-label={p.rotulo}
        disabled={p.travado}
        value={outro ? "__outro" : p.valor}
        onChange={(e) => {
          if (e.target.value === "__outro") {
            setOutro(true);
            p.mudar("");
          } else {
            setOutro(false);
            p.mudar(e.target.value);
          }
        }}
        className={cls}
      >
        <option value="">{p.vazio}</option>
        {p.numeros.map((n) => (
          <option key={n.numero} value={n.numero}>
            {fmt(n.numero)}
            {n.nome ? ` — ${n.nome}` : ""}
          </option>
        ))}
        <option value="__outro">Outro número…</option>
      </select>
      {outro && (
        <input
          aria-label={`${p.rotulo} (digitar)`}
          disabled={p.travado}
          value={p.valor}
          onChange={(e) => p.mudar(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="DDD + número, ex.: 42999998888"
          inputMode="numeric"
          className={`${cls} w-48`}
        />
      )}
    </span>
  );
}

const reais = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const IDADES = Array.from({ length: IDADE_MAXIMA - IDADE_MINIMA + 1 }, (_, i) => IDADE_MINIMA + i);

export function FormularioDoZero(p: {
  clientId: string;
  loja: string;
  rodape: string;
  rodapeDoSite: boolean;
  artesSoltas: { id: string; nome: string }[];
  contas: { id: string; nome: string; metaAccountId: string }[];
  carros: CarroDoZero[];
  paginasIniciais: { id: string; nome: string; sugerida?: boolean }[];
  erroDasPaginas: string | null;
}) {
  const [contaId, setContaId] = useState(p.contas[0].id);
  const [paginas, setPaginas] = useState(p.paginasIniciais);
  const [erroPaginas, setErroPaginas] = useState(p.erroDasPaginas);
  // A página: uma da lista, "outra" (colar o ID ou o link) ou "sem" (o gestor completa no Gerenciador).
  const primeiraPagina = (l: { id: string; sugerida?: boolean }[]) => l.find((x) => x.sugerida)?.id ?? (l.length ? "" : "__outra");
  const [paginaId, setPaginaId] = useState(primeiraPagina(p.paginasIniciais));
  const [outraPagina, setOutraPagina] = useState("");
  const paginaEscolhida = paginaId === "__sem" ? "" : paginaId === "__outra" ? (outraPagina.match(/(?:id=)?(\d{5,25})/)?.[1] ?? "") : paginaId;
  const [nome, setNome] = useState(`${p.loja} — WhatsApp`);
  const [objetivo, setObjetivo] = useState<"leads" | "engajamento">("leads");
  const [rodape, setRodape] = useState(p.rodape);
  // Legenda: "ia" = a IA escreve (a vazia); "minha" = a pessoa escreve a de cada carro (sem IA); "todos" = um texto só, com os
  // dados de cada carro trocados ({carro}, {preco}…).
  const [modoLegenda, setModoLegenda] = useState<"ia" | "minha" | "todos">("ia");
  const [modelo, setModelo] = useState(MODELO_PADRAO);
  // As artes: a de cada carro (vai como 1ª foto) e as que subiram sem carro definido (arrastar pro carro ou escolher).
  const [arteDoCarro, setArteDoCarro] = useState<Record<string, string>>(() => Object.fromEntries(p.carros.filter((c) => c.arteId).map((c) => [c.id, c.arteId as string])));
  const [soltas, setSoltas] = useState(p.artesSoltas);
  const [nomeDaArte, setNomeDaArte] = useState<Record<string, string>>(() => Object.fromEntries(p.artesSoltas.map((a) => [a.id, a.nome])));
  const [subindoArte, setSubindoArte] = useState<string | null>(null);
  const [msgArte, setMsgArte] = useState<string[]>([]);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [boasVindas, setBoasVindas] = useState("Oi! Como podemos ajudar?");
  const [mensagemPronta, setMensagemPronta] = useState("Olá! Posso ter mais informações sobre o {carro}?");
  const [estrutura, setEstrutura] = useState<"por-carro" | "um-conjunto" | "montada">("por-carro");
  // "Montar os conjuntos": quantos o gestor quiser, cada um com nome e (se o orçamento é por conjunto) o seu valor por dia.
  const [conjuntos, setConjuntos] = useState<{ chave: string; nome: string; valor: string; whatsapp?: string }[]>([{ chave: "c1", nome: "Conjunto 1", valor: "" }]);
  // O WhatsApp que recebe os leads: o padrão da campanha ("" = o número da página) e, em cada conjunto, o seu.
  const [whatsappPadrao, setWhatsappPadrao] = useState("");
  const [numeros, setNumeros] = useState<{ numero: string; nome: string }[]>([]);
  const [proximaChave, setProximaChave] = useState(2);
  const [ondeOrcamento, setOndeOrcamento] = useState<"conjunto" | "campanha">("conjunto");
  const [valor, setValor] = useState("15");
  const [idadeMin, setIdadeMin] = useState(25);
  const [idadeMax, setIdadeMax] = useState(IDADE_MAXIMA);
  const [genero, setGenero] = useState<GeneroDoPublico>("todos");
  const [locais, setLocais] = useState<LocalDoPublico[]>([]);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<LocalDoPublico[]>([]);
  const [maxFotos, setMaxFotos] = useState(6);
  const [linhas, setLinhas] = useState<LinhaDoCarro[]>(
    // Com arte na loja, já vêm marcados SÓ os carros com arte (são os que vão subir); sem nenhuma arte, todos.
    p.carros.map((c) => ({ carro: c, marcado: p.carros.some((x) => x.arteId) ? !!c.arteId : true, conjunto: "c1", nome: c.titulo, legenda: "", whatsapp: "", estado: "esperando", msg: c.jaAnunciado ? "já tem anúncio (vai criar outro)" : "" })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [fase, setFase] = useState<"montando" | "criando" | "pronto">("montando");
  const [resumo, setResumo] = useState<string | null>(null);
  const [linkDaCampanha, setLinkDaCampanha] = useState<string | null>(null);
  const [linkDoAjuste, setLinkDoAjuste] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  const marcados = linhas.filter((l) => l.marcado);
  const conta = p.contas.find((c) => c.id === contaId)!;
  const centavos = Math.round(Number(valor.replace(",", ".")) * 100);
  const emCentavos = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  const conjuntosUsados = conjuntos.filter((c) => marcados.some((l) => l.conjunto === c.chave));
  const total =
    ondeOrcamento === "campanha"
      ? centavos
      : estrutura === "por-carro"
        ? centavos * marcados.length
        : estrutura === "um-conjunto"
          ? centavos
          : conjuntosUsados.reduce((t, c) => t + (c.valor.trim() ? emCentavos(c.valor) : centavos), 0);
  const mudar = (i: number, d: Partial<LinhaDoCarro>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...d } : l)));

  function trocarConta(id: string) {
    setContaId(id);
    setPaginas([]);
    setPaginaId("__outra");
    comecar(async () => {
      const r = await listarPaginas(p.clientId, id);
      if (r.ok) {
        setPaginas(r.paginas);
        setPaginaId(primeiraPagina(r.paginas));
        setErroPaginas(r.aviso ?? null);
      } else setErroPaginas(r.erro);
    });
  }

  function buscar() {
    const termo = busca.trim();
    if (termo.length < 2) return;
    comecar(async () => {
      const r = await procurarLocais(p.clientId, termo);
      setAchados(r.ok ? (r.locais ?? []) : []);
    });
  }

  function gerarLegendas() {
    comecar(async () => {
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l.marcado || l.legenda.trim()) continue;
        mudar(i, { msg: "escrevendo legenda…" });
        const r = await legendaDoZero(p.clientId, l.carro.id, rodape);
        mudar(i, r.ok ? { legenda: r.legenda, msg: "" } : { msg: `legenda: ${r.erro}` });
      }
    });
  }

  function criarTudo() {
    setErro(null);
    if (locais.length === 0) return setErro("Adicione pelo menos uma cidade no público.");
    if (paginaId === "") return setErro("Escolha a página do Facebook da loja (ou \"Sem página\").");
    if (paginaId === "__outra" && !paginaEscolhida) return setErro('Cole o ID da página (só números) ou escolha "Sem página".');
    if (marcados.length === 0) return setErro("Marque pelo menos um carro.");
    if (estrutura === "montada" && conjuntosUsados.some((c) => !c.nome.trim())) return setErro("Dê nome a todos os conjuntos.");
    if (modoLegenda === "minha") {
      const sem = marcados.find((l) => l.legenda.trim().length < 10);
      if (sem) return setErro(`Escreva a legenda do ${sem.carro.titulo} (ou troque pra "IA escreve").`);
    }
    if (modoLegenda === "todos" && modelo.trim().length < 10) return setErro("Escreva a legenda que vai pra todos os carros.");
    const descricao =
      estrutura === "por-carro"
        ? `${marcados.length} conjuntos (um por carro)`
        : estrutura === "um-conjunto"
          ? "1 conjunto com todos os carros"
          : `${conjuntosUsados.length} conjuntos: ${conjuntosUsados.map((c) => `${c.nome} (${marcados.filter((l) => l.conjunto === c.chave).length})`).join(", ")}`;
    if (!confirm(`Criar na Meta, tudo PAUSADO:\n\n• 1 campanha "${nome}" (${objetivo === "leads" ? "Leads" : "Engajamento"} → WhatsApp)\n• ${descricao}\n• ${marcados.length} anúncios\n• Orçamento: ${reais(total)}/dia no total${paginaEscolhida ? "" : "\n\nSEM PÁGINA: a Meta não cria anúncio sem página. Cria a campanha e os conjuntos, e sobe as fotos de cada carro pra biblioteca da conta — os anúncios você termina no Gerenciador."}\n\nNada liga sozinho.`)) return;
    setFase("criando");
    comecar(async () => {
      const est = await criarEstruturaDoZero({
        clientId: p.clientId,
        contaId,
        paginaId: paginaEscolhida,
        nome,
        objetivo,
        estrutura,
        orcamento: { onde: ondeOrcamento, centavosPorDia: centavos },
        publico: { idadeMin, idadeMax, genero, locais },
        carros: marcados.map((l) => ({ carroId: l.carro.id, nome: l.nome, conjunto: estrutura === "montada" ? l.conjunto : undefined, whatsapp: estrutura === "por-carro" ? l.whatsapp || null : null })),
        whatsapp: whatsappPadrao || null,
        conjuntos:
          estrutura === "montada"
            ? conjuntos.map((c) => ({ chave: c.chave, nome: c.nome, centavosPorDia: ondeOrcamento === "conjunto" && c.valor.trim() ? emCentavos(c.valor) : null, whatsapp: c.whatsapp || null }))
            : undefined,
      });
      if (!est.ok) {
        setErro(est.erro);
        setFase("montando");
        return;
      }
      setLinkDoAjuste(`/meta-ads/${p.clientId}/campanha-do-zero/ajustar?conta=${conta.metaAccountId}&campanha=${est.campanhaId}`);
      setLinkDaCampanha(`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${conta.metaAccountId.replace(/^act_/, "")}&selected_campaign_ids=${est.campanhaId}`);
      let feitos = 0;
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l.marcado) continue;
        const chave = estrutura === "por-carro" ? l.carro.id : estrutura === "montada" ? l.conjunto : "todos";
        const conj = est.conjuntos.find((c) => c.chave === chave);
        if (!conj) {
          mudar(i, { estado: "erro", msg: "o conjunto deste carro não foi criado" });
          continue;
        }
        mudar(i, { estado: "criando", msg: "legenda…" });
        let legenda = modoLegenda === "todos" ? legendaDoModelo(modelo, l.carro, rodape) : l.legenda.trim();
        if (!legenda && modoLegenda === "ia") {
          const lg = await legendaDoZero(p.clientId, l.carro.id, rodape);
          if (!lg.ok) {
            mudar(i, { estado: "erro", msg: `legenda: ${lg.erro}` });
            continue;
          }
          legenda = lg.legenda;
          mudar(i, { legenda });
        }
        mudar(i, { msg: "fotos e anúncio…" });
        const r = await criarAnuncioNoZero({ clientId: p.clientId, contaMeta: conta.metaAccountId, paginaId: paginaEscolhida, adsetId: conj.adsetId, carroId: l.carro.id, nomeDoAnuncio: l.nome, legenda, maxFotos, boasVindas, mensagemPronta });
        if (r.ok) {
          feitos++;
          mudar(i, { estado: "ok", msg: `${r.fotos} foto(s)${r.avisos.length ? ` · ${r.avisos.join(" ")}` : ""}` });
        } else mudar(i, { estado: "erro", msg: r.erro });
      }
      setResumo(`${feitos} de ${marcados.length} anúncios criados, pausados.${est.avisos.length ? ` ${est.avisos.join(" ")}` : ""}`);
      setFase("pronto");
    });
  }

  const travado = fase !== "montando";

  // Os números do WhatsApp mudam com a conta e a página escolhidas.
  useEffect(() => {
    let vivo = true;
    void listarNumeros(p.clientId, contaId, paginaEscolhida).then((n) => vivo && setNumeros(n));
    return () => {
      vivo = false;
    };
  }, [p.clientId, contaId, paginaEscolhida]);

  /** Põe a arte no carro (na tela). A que o carro tinha volta pra "sem carro", como no servidor. */
  function colocarNoCarro(arteId: string, carroId: string | null) {
    // Carro que ganhou arte entra na lista do que vai subir.
    if (carroId) setLinhas((ls) => ls.map((l) => (l.carro.id === carroId ? { ...l, marcado: true } : l)));
    setArteDoCarro((antes) => {
      const depois = { ...antes };
      const soltar: string[] = [];
      for (const [c, a] of Object.entries(depois)) if (a === arteId) delete depois[c];
      if (carroId) {
        if (depois[carroId] && depois[carroId] !== arteId) soltar.push(depois[carroId]);
        depois[carroId] = arteId;
      } else soltar.push(arteId);
      setSoltas((s) => [...soltar.map((id) => ({ id, nome: nomeDaArte[id] ?? "arte" })), ...s.filter((x) => x.id !== arteId && !soltar.includes(x.id))]);
      return depois;
    });
  }

  async function subirArtes(arquivos: File[], carroId?: string) {
    const lista = carroId ? arquivos.slice(0, 1) : arquivos;
    if (lista.length === 0) return;
    const saida: string[] = [];
    for (const [i, f] of lista.entries()) {
      setSubindoArte(`Subindo ${i + 1} de ${lista.length}: ${f.name}`);
      const form = new FormData();
      form.set("clientId", p.clientId);
      form.set("arquivo", f);
      if (carroId) form.set("carroId", carroId);
      try {
        const r = await subirArte(form);
        if (!r.ok) {
          saida.push(`✗ ${r.erro}`);
          continue;
        }
        setNomeDaArte((n) => ({ ...n, [r.id]: f.name }));
        if (r.carroId) colocarNoCarro(r.id, r.carroId);
        else setSoltas((s) => [{ id: r.id, nome: f.name }, ...s]);
        saida.push(r.carro ? `✓ ${f.name} → ${r.carro}` : `• ${f.name}: arraste pro carro ou escolha abaixo`);
      } catch {
        saida.push(`✗ ${f.name}: não subiu (arquivo maior que 6 MB?)`);
      }
    }
    setSubindoArte(null);
    setMsgArte(saida);
  }

  async function ligarArte(arteId: string, carroId: string) {
    const r = await atribuirArte(p.clientId, arteId, carroId);
    if (r.erro) return setMsgArte([`✗ ${r.erro}`]);
    colocarNoCarro(arteId, carroId || null);
  }

  /** Soltar em cima de um carro: arquivo do computador sobe pra ele; arte da bandeja é ligada a ele. */
  function soltarNoCarro(e: React.DragEvent, carroId: string) {
    e.preventDefault();
    setAlvo(null);
    if (travado) return;
    const arteId = e.dataTransfer.getData("text/x-arte");
    if (arteId) return void ligarArte(arteId, carroId);
    const arquivos = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (arquivos.length) void subirArtes(arquivos, carroId);
  }
  const caixa = "rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3";
  const campo = "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-5">
      <section className={caixa}>
        <h2 className="font-semibold">1. Conta e página</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Conta de anúncio
            <select disabled={travado} value={contaId} onChange={(e) => trocarConta(e.target.value)} className={campo}>
              {p.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Página do Facebook (o WhatsApp é o ligado a ela)
            <select disabled={travado} value={paginaId} onChange={(e) => setPaginaId(e.target.value)} className={campo} aria-label="Página do Facebook">
              {paginaId === "" && <option value="">— escolha a página —</option>}
              {paginas.some((pg) => pg.sugerida) && (
                <optgroup label="Desta loja">
                  {paginas.filter((pg) => pg.sugerida).map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              {paginas.some((pg) => !pg.sugerida) && (
                <optgroup label="Todas do portfólio">
                  {paginas.filter((pg) => !pg.sugerida).map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__outra">Outra página (colar o ID)</option>
              <option value="__sem">Sem página (termino no Gerenciador)</option>
            </select>
            {paginaId === "__outra" && (
              <input
                disabled={travado}
                value={outraPagina}
                onChange={(e) => setOutraPagina(e.target.value)}
                placeholder="ID da página (ex.: 102938475610293) ou link com id="
                aria-label="ID da página"
                className={campo}
              />
            )}
            {paginaId === "__outra" && (
              <span className="text-xs text-foreground-muted">
                Onde achar: na página da loja no Facebook → Sobre → Transparência da página (ID da página). Ou no Gerenciador de Negócios → Contas → Páginas.
              </span>
            )}
            {paginaId === "__sem" && <span className="text-xs text-amber-600 dark:text-amber-400">Sem página a Meta não deixa criar o anúncio: cria a campanha e os conjuntos, e as fotos de cada carro sobem pra biblioteca da conta.</span>}
          </label>
        </div>
        {erroPaginas && <p className="text-xs text-amber-600 dark:text-amber-400">{erroPaginas}</p>}
      </section>

      <section className={caixa}>
        <h2 className="font-semibold">2. Campanha, estrutura e orçamento</h2>
        <label className="flex flex-col gap-1 text-sm">
          Nome da campanha
          <input disabled={travado} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          Objetivo da campanha
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["leads", "Leads"],
                ["engajamento", "Engajamento"],
              ] as const
            ).map(([v, r]) => (
              <button key={v} type="button" disabled={travado} onClick={() => setObjetivo(v)} className={`px-3 py-2 rounded-lg border ${objetivo === v ? "border-accent bg-accent/10" : "border-border"}`}>
                {r}
              </button>
            ))}
          </div>
          <span className="text-xs text-foreground-muted">Local da conversão: só mensagens no WhatsApp.</span>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["por-carro", "Um conjunto por carro"],
              ["um-conjunto", "Um conjunto com todos"],
              ["montada", "Montar os conjuntos"],
            ] as const
          ).map(([v, r]) => (
            <button key={v} type="button" disabled={travado} onClick={() => setEstrutura(v)} className={`px-3 py-2 rounded-lg border ${estrutura === v ? "border-accent bg-accent/10" : "border-border"}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          WhatsApp que recebe os leads
          <SeletorDeNumero valor={whatsappPadrao} mudar={setWhatsappPadrao} numeros={numeros} vazio="O número ligado à página" rotulo="WhatsApp da campanha" travado={travado || !paginaEscolhida} />
          <span className="text-xs text-foreground-muted">
            {!paginaEscolhida
              ? "Escolha a página primeiro (o número vai junto com a página)."
              : estrutura === "um-conjunto"
                ? "Vale pro conjunto."
                : `Vale pra todos os conjuntos; ${estrutura === "montada" ? "cada conjunto abaixo" : "cada carro (parte 4)"} pode ter o seu.`}
          </span>
        </div>
        {estrutura === "montada" && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs text-foreground-muted">
              Crie quantos conjuntos quiser e escolha, em cada carro (parte 4), em qual conjunto ele vai. Conjunto sem carro não é criado.
              {ondeOrcamento === "conjunto" ? " Valor vazio = o valor padrão abaixo." : ""}
            </p>
            {conjuntos.map((c, i) => (
              <div key={c.chave} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  disabled={travado}
                  value={c.nome}
                  onChange={(e) => setConjuntos(conjuntos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                  placeholder="Nome do conjunto"
                  aria-label={`Nome do conjunto ${i + 1}`}
                  className={`${campo} flex-1 min-w-48`}
                />
                {ondeOrcamento === "conjunto" && (
                  <label className="flex items-center gap-1">
                    R$
                    <input
                      disabled={travado}
                      inputMode="decimal"
                      value={c.valor}
                      onChange={(e) => setConjuntos(conjuntos.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                      placeholder={valor || "—"}
                      aria-label={`Orçamento do conjunto ${i + 1}`}
                      className={`${campo} w-20`}
                    />
                    /dia
                  </label>
                )}
                <SeletorDeNumero
                  valor={c.whatsapp ?? ""}
                  mudar={(v) => setConjuntos((cs) => cs.map((x) => (x.chave === c.chave ? { ...x, whatsapp: v } : x)))}
                  numeros={numeros}
                  vazio="WhatsApp: o padrão"
                  rotulo={`WhatsApp do conjunto ${i + 1}`}
                  travado={travado || !paginaEscolhida}
                  pequeno
                />
                <span className="text-xs text-foreground-muted">{marcados.filter((l) => l.conjunto === c.chave).length} carro(s)</span>
                {conjuntos.length > 1 && (
                  <button
                    type="button"
                    disabled={travado}
                    aria-label={`Tirar o conjunto ${i + 1}`}
                    onClick={() => {
                      const resto = conjuntos.filter((_, j) => j !== i);
                      setConjuntos(resto);
                      setLinhas((ls) => ls.map((l) => (l.conjunto === c.chave ? { ...l, conjunto: resto[0].chave } : l)));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={travado}
              onClick={() => {
                setConjuntos([...conjuntos, { chave: `c${proximaChave}`, nome: `Conjunto ${conjuntos.length + 1}`, valor: "" }]);
                setProximaChave(proximaChave + 1);
              }}
              className="text-sm px-3 py-1.5 rounded-lg border border-dashed border-border w-fit"
            >
              + Adicionar conjunto
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex gap-2">
            {(
              [
                ["conjunto", estrutura === "por-carro" ? "Por carro (conjunto)" : estrutura === "montada" ? "Por conjunto" : "No conjunto"],
                ["campanha", "Na campanha (a Meta divide)"],
              ] as const
            ).map(([v, r]) => (
              <button key={v} type="button" disabled={travado} onClick={() => setOndeOrcamento(v)} className={`px-3 py-2 rounded-lg border ${ondeOrcamento === v ? "border-accent bg-accent/10" : "border-border"}`}>
                {r}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            R$
            <input disabled={travado} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} w-24`} />
            por dia
          </label>
          <span className="text-foreground-muted">Total: {Number.isFinite(total) ? reais(total) : "—"}/dia</span>
        </div>
      </section>

      <section className={caixa}>
        <h2 className="font-semibold">3. Público</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          De
          <select disabled={travado} value={idadeMin} onChange={(e) => setIdadeMin(Number(e.target.value))} className={campo}>
            {IDADES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          até
          <select disabled={travado} value={idadeMax} onChange={(e) => setIdadeMax(Number(e.target.value))} className={campo}>
            {IDADES.map((n) => (
              <option key={n} value={n}>
                {n === IDADE_MAXIMA ? "65+" : n}
              </option>
            ))}
          </select>
          anos
          {(
            [
              ["todos", "Todos"],
              ["homens", "Homens"],
              ["mulheres", "Mulheres"],
            ] as const
          ).map(([v, r]) => (
            <button key={v} type="button" disabled={travado} onClick={() => setGenero(v)} className={`px-3 py-1.5 rounded-lg border ${genero === v ? "border-accent bg-accent/10" : "border-border"}`}>
              {r}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {locais.map((l, i) => (
            <li key={`${l.chave}-${i}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="flex-1">
                {l.nome} <span className="text-xs text-foreground-muted">{l.detalhe}</span>
              </span>
              {l.tipo === "cidade" && (
                <select disabled={travado} value={l.raioKm ?? 0} onChange={(e) => setLocais(locais.map((x, j) => (j === i ? { ...x, raioKm: Number(e.target.value) || null } : x)))} className={campo}>
                  <option value={0}>só a cidade</option>
                  {RAIOS_DA_CIDADE.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              )}
              <button type="button" disabled={travado} onClick={() => setLocais(locais.filter((_, j) => j !== i))} aria-label="Tirar">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            disabled={travado}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscar())}
            placeholder="Adicionar cidade ou estado (ex.: Ponta Grossa)"
            className={`${campo} flex-1`}
          />
          <button type="button" disabled={travado || pendente} onClick={buscar} className="px-3 rounded-lg border border-border inline-flex items-center gap-1.5 text-sm">
            <Search size={14} /> Buscar
          </button>
        </div>
        {achados.length > 0 && (
          <ul className="flex flex-col rounded-lg border border-border divide-y divide-border text-sm">
            {achados.map((a) => (
              <li key={`${a.tipo}-${a.chave}`}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-surface-muted"
                  onClick={() => {
                    if (!locais.some((x) => x.chave === a.chave && x.tipo === a.tipo)) setLocais([...locais, { ...a, raioKm: a.tipo === "cidade" ? 17 : null }]);
                    setAchados([]);
                    setBusca("");
                  }}
                >
                  {a.nome} <span className="text-xs text-foreground-muted">{a.detalhe}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2 text-sm opacity-80">
          <input type="checkbox" checked={false} disabled readOnly className="mt-1" />
          <span>
            Alcançar mais pessoas (Advantage+ público) — <strong>sempre desligado</strong>
          </span>
        </label>
      </section>

      <section className={caixa}>
        <h2 className="font-semibold">Modelo de conversa do WhatsApp</h2>
        <label className="flex flex-col gap-1 text-sm">
          Mensagem de boas-vindas
          <input disabled={travado} value={boasVindas} onChange={(e) => setBoasVindas(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mensagem pronta (o cliente envia)
          <input disabled={travado} value={mensagemPronta} onChange={(e) => setMensagemPronta(e.target.value)} className={campo} />
        </label>
        <p className="text-xs text-foreground-muted">
          <code>{"{carro}"}</code> vira o nome de cada carro. Ex.: {mensagemPronta.replaceAll("{carro}", linhas[0]?.carro.titulo ?? "Onix 2020")}
        </p>
      </section>

      <section className={caixa}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">4. Carros ({marcados.length} de {linhas.length})</h2>
            {(
              [
                ["Só os com arte", (l: LinhaDoCarro) => !!arteDoCarro[l.carro.id]],
                ["Marcar todos", () => true],
                ["Desmarcar todos", () => false],
              ] as const
            ).map(([r, f]) => (
              <button key={r} type="button" disabled={travado} onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, marcado: f(l) })))} className="px-2 py-1 rounded-lg border border-border text-xs">
                {r}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Fotos por anúncio
            <select disabled={travado} value={maxFotos} onChange={(e) => setMaxFotos(Number(e.target.value))} className={campo}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {modoLegenda === "ia" && (
              <button type="button" disabled={travado || pendente} onClick={gerarLegendas} className="px-3 py-2 rounded-lg border border-border inline-flex items-center gap-1.5">
                <Sparkles size={14} /> Escrever legendas com IA
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Legenda
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ia", "IA escreve (pode editar)"],
                ["minha", "Eu escrevo a de cada carro"],
                ["todos", "Uma legenda pra todos"],
              ] as const
            ).map(([v, r]) => (
              <button key={v} type="button" disabled={travado} onClick={() => setModoLegenda(v)} className={`px-3 py-2 rounded-lg border ${modoLegenda === v ? "border-accent bg-accent/10" : "border-border"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {modoLegenda === "todos" && (
          <label className="flex flex-col gap-1 text-sm">
            Legenda de todos os carros
            <textarea disabled={travado} value={modelo} onChange={(e) => setModelo(e.target.value)} rows={7} className={campo} aria-label="Legenda de todos os carros" />
            <span className="text-xs text-foreground-muted">
              <code>{"{carro} {ano} {km} {cor} {preco} {rodape}"}</code> viram os dados de cada carro; linha sem dado some. Sem IA.
            </span>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Rodapé da legenda (endereço e WhatsApp da loja)
          <textarea disabled={travado} value={rodape} onChange={(e) => setRodape(e.target.value)} rows={3} placeholder={"📍 Rua ..., 123 - Bairro - Cidade\n📲 WhatsApp: (42) 9xxxx-xxxx"} className={campo} />
          <span className="text-xs text-foreground-muted">
            {p.rodapeDoSite && p.rodape ? "Puxado do site da loja — confira. " : !p.rodape ? "O site não mostrou endereço/WhatsApp: escreva aqui. " : ""}
            {modoLegenda === "ia" ? "A IA termina cada legenda com este rodapé, e ele fica salvo pra loja." : modoLegenda === "todos" ? "Entra onde estiver {rodape}." : "Não é usado quando você escreve cada legenda."}
          </span>
        </label>
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!travado) void subirArtes([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
              }}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-accent bg-accent/10 text-sm font-medium cursor-pointer ${travado || subindoArte ? "opacity-50 pointer-events-none" : ""}`}
            >
              <Upload size={14} />
              {subindoArte ?? "Subir artes (várias de uma vez, ou arraste aqui)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                aria-label="Subir artes"
                onChange={(e) => {
                  void subirArtes([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-xs text-foreground-muted">
              {Object.keys(arteDoCarro).length} de {p.carros.length} carros com arte. A arte vai como 1ª foto e as fotos do site são cortadas na proporção dela.
              Nome do arquivo com o carro (ex.: <code>onix lt 2020.png</code>) liga sozinho; senão, arraste a arte até o carro.{" "}
              <a href={`/inteligencia-comercial/estoque/${p.clientId}/artes`} target="_blank" className="underline">Banco de artes</a>
            </span>
          </div>
          {msgArte.length > 0 && (
            <ul className="text-xs flex flex-col gap-0.5">
              {msgArte.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          {soltas.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Artes sem carro — arraste até o carro ou escolha:</span>
              <div className="flex flex-wrap gap-2">
                {soltas.map((a) => (
                  <div
                    key={a.id}
                    draggable={!travado}
                    onDragStart={(e) => e.dataTransfer.setData("text/x-arte", a.id)}
                    className="w-32 rounded-lg border border-amber-500 p-1.5 flex flex-col gap-1 cursor-grab bg-surface"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/estoque/arte/${a.id}`} alt={a.nome} className="w-full h-24 object-contain rounded bg-surface-muted pointer-events-none" />
                    <span className="text-[10px] truncate" title={a.nome}>
                      {a.nome}
                    </span>
                    <select
                      aria-label={`Carro da arte ${a.nome}`}
                      disabled={travado}
                      value=""
                      onChange={(e) => e.target.value && void ligarArte(a.id, e.target.value)}
                      className="rounded border border-border bg-surface text-[11px] px-1 py-0.5"
                    >
                      <option value="">de qual carro?</option>
                      {p.carros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-foreground-muted">{modoLegenda === "ia" ? "Legenda vazia é escrita pela IA na hora de criar." : modoLegenda === "minha" ? "Escreva a legenda de cada carro (a IA não entra)." : "Abaixo, a prévia da legenda de cada carro."} O nome vale pro anúncio{estrutura === "por-carro" ? " e pro conjunto do carro" : ""}.{estrutura === "montada" ? " Escolha o conjunto de cada carro." : ""}</p>
        <ul className="flex flex-col gap-3">
          {linhas.map((l, i) => (
            <li
              key={l.carro.id}
              data-carro={l.carro.titulo}
              onDragOver={(e) => {
                if (travado) return;
                e.preventDefault();
                if (alvo !== l.carro.id) setAlvo(l.carro.id);
              }}
              onDragLeave={() => setAlvo((a) => (a === l.carro.id ? null : a))}
              onDrop={(e) => soltarNoCarro(e, l.carro.id)}
              className={`rounded-xl border p-3 flex flex-col gap-2 ${alvo === l.carro.id ? "border-accent bg-accent/10" : l.estado === "ok" ? "border-emerald-500/50" : l.estado === "erro" ? "border-red-500/50" : "border-border"}`}
            >
              <div className="flex items-start gap-3">
                <input type="checkbox" disabled={travado} checked={l.marcado} onChange={(e) => mudar(i, { marcado: e.target.checked })} className="mt-1" />
                {arteDoCarro[l.carro.id] ? (
                  <span className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/estoque/arte/${arteDoCarro[l.carro.id]}`} alt={`Arte do ${l.carro.titulo}`} title="Arte: vai como 1ª foto" className="w-16 h-16 object-cover rounded ring-2 ring-accent" />
                    {!travado && (
                      <button
                        type="button"
                        aria-label={`Tirar a arte do ${l.carro.titulo}`}
                        onClick={() => void ligarArte(arteDoCarro[l.carro.id], "")}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-surface border border-border p-0.5"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ) : (
                  <label
                    title="Solte a arte aqui ou clique pra escolher"
                    className={`shrink-0 w-16 h-16 rounded border border-dashed border-border flex flex-col items-center justify-center text-[10px] text-foreground-muted text-center ${travado ? "" : "cursor-pointer hover:border-accent"}`}
                  >
                    <Upload size={12} />
                    arte
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={travado}
                      className="hidden"
                      aria-label={`Arte do ${l.carro.titulo}`}
                      onChange={(e) => {
                        void subirArtes([...(e.target.files ?? [])], l.carro.id);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <input disabled={travado || !l.marcado} value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} className={`${campo} font-medium`} />
                  {estrutura === "por-carro" && l.marcado && paginaEscolhida && (
                    <label className="flex items-center gap-2 text-xs">
                      WhatsApp do conjunto:
                      <SeletorDeNumero valor={l.whatsapp} mudar={(v) => mudar(i, { whatsapp: v })} numeros={numeros} vazio="o padrão" rotulo={`WhatsApp de ${l.carro.titulo}`} travado={travado} pequeno />
                    </label>
                  )}
                  {estrutura === "montada" && l.marcado && (
                    <label className="flex items-center gap-2 text-xs">
                      Conjunto:
                      <select disabled={travado} value={l.conjunto} onChange={(e) => mudar(i, { conjunto: e.target.value })} aria-label={`Conjunto de ${l.carro.titulo}`} className={`${campo} py-1`}>
                        {conjuntos.map((c) => (
                          <option key={c.chave} value={c.chave}>
                            {c.nome || "(sem nome)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span className="text-xs text-foreground-muted">
                    {[l.carro.anoModelo, l.carro.km !== null ? `${l.carro.km.toLocaleString("pt-BR")} km` : null, l.carro.cor, reais(l.carro.precoCents)].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <span className="text-xs shrink-0 flex items-center gap-1">
                  {l.estado === "criando" && <Loader2 size={12} className="animate-spin" />}
                  {l.estado === "ok" && <Check size={12} className="text-emerald-500" />}
                  {l.estado === "erro" && <AlertTriangle size={12} className="text-red-500" />}
                  <span className={l.estado === "erro" ? "text-red-500" : "text-foreground-muted"}>{l.msg}</span>
                </span>
              </div>
              {l.marcado && modoLegenda === "todos" && (
                <pre className="whitespace-pre-wrap text-xs rounded-lg bg-surface-muted p-2 font-sans" aria-label={`Prévia da legenda do ${l.carro.titulo}`}>
                  {legendaDoModelo(modelo, l.carro, rodape)}
                </pre>
              )}
              {l.marcado && modoLegenda !== "todos" && (
                <textarea
                  disabled={travado}
                  value={l.legenda}
                  onChange={(e) => mudar(i, { legenda: e.target.value })}
                  placeholder={modoLegenda === "ia" ? "Legenda (vazia = a IA escreve na hora)" : "Escreva a legenda deste carro"}
                  aria-label={`Legenda do ${l.carro.titulo}`}
                  rows={l.legenda || modoLegenda === "minha" ? 4 : 1}
                  className={`${campo} text-xs`}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {erro && <p className="text-sm text-red-500 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {erro}</p>}
      {resumo && <p className="text-sm font-medium">{resumo}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {fase !== "pronto" && (
          <button type="button" disabled={travado || pendente} onClick={criarTudo} className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {fase === "criando" ? <Loader2 size={15} className="animate-spin" /> : null}
            {fase === "criando" ? "Criando… (não feche a página)" : `Criar tudo pausado (${marcados.length} carros)`}
          </button>
        )}
        {linkDaCampanha && (
          <a href={linkDaCampanha} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1.5 text-accent">
            Abrir a campanha no Gerenciador <ExternalLink size={13} />
          </a>
        )}
        {linkDoAjuste && (
          <a href={linkDoAjuste} className="text-sm inline-flex items-center gap-1.5 text-accent font-medium">
            Ajustar esta campanha (mover carro de conjunto, nomes, orçamento)
          </a>
        )}
      </div>
    </div>
  );
}
