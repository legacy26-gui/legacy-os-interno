"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Loader2, Sparkles, Trash2, TriangleAlert, CheckCircle2 } from "lucide-react";
import { conferirAnuncioBase, criarRascunho, gerarLegenda, subirFoto, type RespostaDoRascunho } from "@/lib/actions/rascunho";

// O formulário de subir anúncio como rascunho.
//
// ── O que a pessoa faz ───────────────────────────────────────────────────
//
//   1. escolhe a campanha e o conjunto onde o anúncio vai ficar;
//   2. escolhe um anúncio da loja pra DUPLICAR (a página, o botão e o rastreamento vêm dele);
//   3. (opcional) escolhe o carro no estoque do site, que preenche nome, título e dados;
//   4. manda as fotos (uma = foto única, várias = carrossel);
//   5. escreve a legenda, ou pede pra IA escrever e CONFERE antes de subir;
//   6. sobe. O anúncio nasce PAUSADO; ela confere e publica no Gerenciador.
//
// ── Por que as fotos são reduzidas AQUI, no navegador ────────────────────
//
// Foto de celular tem 4 a 10 MB, e a hospedagem não aceita pedido desse tamanho. Cada foto é redimensionada
// (lado maior de 1.440 px) e vira JPEG antes de subir, e sobe UMA POR VEZ: se a quinta falhar, as quatro
// primeiras não repetem (o código delas fica guardado até o envio terminar).
//
// ── Por que não é <form action> ──────────────────────────────────────────
//
// Formulário com action se apaga quando a ação devolve erro, e aqui o texto e as fotos custam trabalho.
// Tudo vive em estado e só é limpo quando o anúncio de fato subiu.

export interface CampanhaOpt { id: string; nome: string; status: string | null }
export interface ConjuntoOpt { id: string; campanhaId: string | null; nome: string; status: string | null; orcamentoCents: number | null }
export interface AnuncioOpt { id: string; nome: string; status: string | null; conjuntoId: string | null; campanhaId: string | null }
export interface CarroOpt { id: string; titulo: string; marca: string | null; modelo: string | null; versao: string | null; ano: number | null; km: number | null; cor: string | null; precoCents: number | null; url: string }

interface Foto {
  chave: string;
  nome: string;
  /** O que sobe: já reduzida. */
  arquivo: File;
  previa: string;
  /** Código na Meta, depois de enviada. */
  hash?: string;
  /** Em qual conjunto foi enviada (a foto fica na conta do conjunto). */
  hashDoConjunto?: string;
}

const LADO_MAXIMO = 1440;
const TETO_DO_ARQUIVO = 3_000_000;

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Reduz a foto e converte pra JPEG. Devolve também o tamanho em pixels (a Meta pede pelo menos 600). */
async function prepararFoto(original: File): Promise<{ arquivo: File; lado: number }> {
  const bmp = await createImageBitmap(original);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  ctx.fillStyle = "#fff"; // PNG com fundo transparente vira branco, não preto
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const lado = Math.min(bmp.width, bmp.height);
  bmp.close();
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && (blob.size <= TETO_DO_ARQUIVO || q === 0.65)) {
      const nome = original.name.replace(/\.[^.]+$/, "") + ".jpg";
      return { arquivo: new File([blob], nome, { type: "image/jpeg" }), lado };
    }
  }
  throw new Error("não deu pra reduzir");
}

/** A ficha do carro do estoque, em texto, pra legenda da IA. */
function dadosDoCarro(c: CarroOpt): string {
  const partes = [c.titulo, c.ano ? `ano ${c.ano}` : null, c.km !== null ? `${c.km.toLocaleString("pt-BR")} km` : null, c.cor ? `cor ${c.cor}` : null, c.precoCents ? `preço ${reais(c.precoCents)}` : null];
  return partes.filter(Boolean).join(", ");
}

export function Formulario({
  clientId,
  sugeridoCents,
  campanhas,
  conjuntos,
  anuncios,
  estoque,
  escritaLiberada,
  carroInicial,
  padrao,
  baseInicial,
}: {
  clientId: string;
  sugeridoCents: number | null;
  campanhas: CampanhaOpt[];
  conjuntos: ConjuntoOpt[];
  anuncios: AnuncioOpt[];
  estoque: CarroOpt[];
  escritaLiberada: boolean;
  /** Carro do estoque que já chega escolhido (vindo de uma sugestão da Inteligência Comercial). */
  carroInicial?: string;
  /** O "mesmo de sempre" da loja: o conjunto (ou molde), o anúncio-base, se é um carro por conjunto e o orçamento. */
  padrao?: { adsetId: string; baseAdId: string; duplicarConjunto: boolean; orcamentoCents: number | null } | null;
  /** O anúncio-base do "mesmo de sempre", já lido na Meta pelo servidor (se ainda serve). */
  baseInicial?: { id: string; formato: "foto" | "carrossel"; legenda: string; titulo: string; link: string } | null;
}) {
  const inicial = estoque.find((c) => c.id === carroInicial) ?? null;
  const conjuntoDoPadrao = padrao ? conjuntos.find((c) => c.id === padrao.adsetId) ?? null : null;
  const [campanhaId, setCampanhaId] = useState(conjuntoDoPadrao?.campanhaId ?? "");
  const [conjuntoId, setConjuntoId] = useState(conjuntoDoPadrao?.id ?? "");
  const [baseId, setBaseId] = useState(baseInicial?.id ?? "");
  // "Um carro por conjunto": o conjunto escolhido é o MOLDE e cada anúncio ganha um conjunto novo (duplicado).
  const [modo, setModo] = useState<"existente" | "novo">(conjuntoDoPadrao && padrao?.duplicarConjunto ? "novo" : "existente");
  const [nomeConjunto, setNomeConjunto] = useState("");
  const [orcamento, setOrcamento] = useState(
    conjuntoDoPadrao && padrao?.orcamentoCents ? (padrao.orcamentoCents / 100).toLocaleString("pt-BR") : "",
  );
  /** Conjunto já criado numa tentativa que falhou depois: a próxima sobe nele, em vez de criar outro. */
  const [conjuntoJaCriado, setConjuntoJaCriado] = useState<{ adsetId: string; nome: string; molde: string } | null>(null);
  const [base, setBase] = useState<{ carregando: boolean; erro?: string; formato?: "foto" | "carrossel"; legenda?: string; titulo?: string; link?: string }>(
    baseInicial ? { carregando: false, formato: baseInicial.formato, legenda: baseInicial.legenda, titulo: baseInicial.titulo, link: baseInicial.link } : { carregando: false },
  );

  const [carroId, setCarroId] = useState(inicial?.id ?? "");
  const [dados, setDados] = useState(inicial ? dadosDoCarro(inicial) : "");
  const [nome, setNome] = useState(inicial?.titulo.slice(0, 120) ?? "");
  const [titulo, setTitulo] = useState(inicial?.titulo.slice(0, 120) ?? "");
  const [legenda, setLegenda] = useState("");
  const [link, setLink] = useState(baseInicial?.link ?? "");
  const [doBaseAberto, setDoBaseAberto] = useState(false);

  const [fotos, setFotos] = useState<Foto[]>([]);
  const [avisoDeFoto, setAvisoDeFoto] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);

  const [gerando, setGerando] = useState(false);
  const [erroLegenda, setErroLegenda] = useState<string | null>(null);
  const [avisosLegenda, setAvisosLegenda] = useState<string[]>([]);
  const [legendaDaIa, setLegendaDaIa] = useState(false);

  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaDoRascunho | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const conjuntosDaCampanha = useMemo(() => conjuntos.filter((c) => c.campanhaId === campanhaId), [conjuntos, campanhaId]);
  const conjunto = conjuntos.find((c) => c.id === conjuntoId) ?? null;
  const carro = estoque.find((c) => c.id === carroId) ?? null;

  // Os anúncios pra duplicar: os do próprio conjunto primeiro, depois os da campanha, depois o resto da loja.
  const bases = useMemo(() => {
    const ordem = (a: AnuncioOpt) => (a.conjuntoId === conjuntoId ? 0 : a.campanhaId === campanhaId ? 1 : 2) * 10 + (a.status === "ACTIVE" ? 0 : 1);
    return [...anuncios].sort((a, b) => ordem(a) - ordem(b));
  }, [anuncios, conjuntoId, campanhaId]);

  async function escolherBase(id: string) {
    setBaseId(id);
    setBase({ carregando: !!id });
    if (!id) return;
    const r = await conferirAnuncioBase(clientId, id);
    if (!r.ok) {
      setBase({ carregando: false, erro: r.erro });
      return;
    }
    setBase({ carregando: false, formato: r.formato, legenda: r.legenda, titulo: r.titulo, link: r.link });
    // O link do base é o destino certo na maioria das vezes (site, WhatsApp). Só preenche se estiver vazio.
    setLink((atual) => atual || r.link || "");
  }

  function escolherCampanha(id: string) {
    setCampanhaId(id);
    setConjuntoId("");
    setBaseId("");
    setBase({ carregando: false });
  }

  function escolherConjunto(id: string) {
    setConjuntoId(id);
    setFotos((fs) => fs.map((f) => ({ ...f, hash: undefined, hashDoConjunto: undefined })));
    const primeiro = [...anuncios].filter((a) => a.conjuntoId === id).sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1))[0];
    void escolherBase(primeiro?.id ?? "");
  }

  function escolherCarro(id: string) {
    setCarroId(id);
    const c = estoque.find((x) => x.id === id);
    if (!c) return;
    setDados(dadosDoCarro(c));
    setNome(c.titulo.slice(0, 120));
    setTitulo(c.titulo.slice(0, 120));
  }

  async function aoEscolherArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setLendo(true);
    setAvisoDeFoto(null);
    const novas: Foto[] = [];
    const problemas: string[] = [];
    for (const original of Array.from(lista)) {
      try {
        const { arquivo, lado } = await prepararFoto(original);
        if (lado < 600) problemas.push(`${original.name} é pequena (${lado}px no menor lado); a Meta pede pelo menos 600px.`);
        novas.push({ chave: `${Date.now()}-${Math.random().toString(36).slice(2)}`, nome: arquivo.name, arquivo, previa: URL.createObjectURL(arquivo) });
      } catch {
        problemas.push(`Não consegui ler ${original.name}. Tenta salvar como JPEG ou PNG.`);
      }
    }
    setFotos((atual) => [...atual, ...novas].slice(0, 10));
    if (fotos.length + novas.length > 10) problemas.push("O carrossel aceita no máximo 10 fotos; as demais ficaram de fora.");
    setAvisoDeFoto(problemas.length ? problemas.join(" ") : null);
    setLendo(false);
    if (entrada.current) entrada.current.value = "";
  }

  function mover(i: number, delta: number) {
    setFotos((fs) => {
      const j = i + delta;
      if (j < 0 || j >= fs.length) return fs;
      const copia = [...fs];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  async function pedirLegenda() {
    setGerando(true);
    setErroLegenda(null);
    const r = await gerarLegenda(clientId, dados, base.legenda ?? "");
    setGerando(false);
    if (!r.ok || !r.legenda) {
      setErroLegenda(r.erro ?? "Não deu pra gerar a legenda.");
      return;
    }
    setLegenda(r.legenda);
    setAvisosLegenda(r.avisos ?? []);
    setLegendaDaIa(true);
  }

  const baseTemTitulo = !!base.titulo;
  const faltas: string[] = [];
  if (!conjuntoId) faltas.push("o conjunto");
  if (!baseId || base.erro || !base.formato) faltas.push("um anúncio base que dê pra duplicar");
  if (fotos.length === 0) faltas.push("pelo menos uma foto");
  if (!nome.trim()) faltas.push("o nome do anúncio");
  if (!legenda.trim()) faltas.push("a legenda");
  if (baseTemTitulo && !titulo.trim()) faltas.push("o título");
  if (!link.trim()) faltas.push("o link");
  const orcamentoCents = orcamento.trim() ? Math.round(Number(orcamento.replace(/\./g, "").replace(",", ".")) * 100) : null;
  if (modo === "novo" && orcamentoCents !== null && (!Number.isFinite(orcamentoCents) || orcamentoCents < 100 || orcamentoCents > 100_000)) {
    faltas.push("um orçamento diário válido (R$ 1 a R$ 1.000)");
  }
  const podeSubir = escritaLiberada && faltas.length === 0 && !enviando && !base.carregando;

  async function subir() {
    setErro(null);
    setResultado(null);
    try {
      // 1. As fotos, uma por vez. O código fica guardado: se algo falhar adiante, não repete o que já subiu.
      const comHash: Foto[] = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        if (f.hash && f.hashDoConjunto === conjuntoId) {
          comHash.push(f);
          continue;
        }
        setEnviando(`Enviando foto ${i + 1} de ${fotos.length}…`);
        const fd = new FormData();
        fd.set("clientId", clientId);
        fd.set("adsetId", conjuntoId);
        fd.set("foto", f.arquivo);
        const r = await subirFoto(fd);
        if (!r.ok || !r.hash) {
          setErro(r.erro ?? "Não consegui enviar uma das fotos.");
          setEnviando(null);
          return;
        }
        const atualizada = { ...f, hash: r.hash, hashDoConjunto: conjuntoId };
        comHash.push(atualizada);
        setFotos((fs) => fs.map((x) => (x.chave === f.chave ? atualizada : x)));
      }

      // 2. O anúncio, duplicando o base, pausado.
      setEnviando("Criando o anúncio pausado…");
      // Conjunto novo: na primeira tentativa duplica o molde; se ela criou o conjunto e falhou depois, reaproveita.
      const reaproveita = modo === "novo" && conjuntoJaCriado?.molde === conjuntoId ? conjuntoJaCriado : null;
      if (modo === "novo" && !reaproveita) setEnviando("Duplicando o conjunto e criando o anúncio pausado…");
      const r = await criarRascunho({
        clientId,
        baseAdId: baseId,
        adsetId: conjuntoId,
        conjuntoNovo: modo === "novo" ? { nome: (nomeConjunto.trim() || nome.trim()).slice(0, 200), orcamentoCents, jaCriadoId: reaproveita?.adsetId ?? null } : null,
        nome: nome.trim(),
        legenda: legenda.trim(),
        titulo: titulo.trim(),
        link: link.trim(),
        hashes: comHash.map((f) => f.hash as string),
      });
      setEnviando(null);
      if (!r.ok) {
        if (r.adsetCriado) setConjuntoJaCriado({ ...r.adsetCriado, molde: conjuntoId });
        setErro(r.erro ?? "Não consegui criar o anúncio.");
        if (r.avisos?.length) setResultado({ ok: false, avisos: r.avisos });
        return;
      }
      setResultado(r);
      setConjuntoJaCriado(null);
      setNomeConjunto("");
      // Só limpa o que é do carro: campanha, conjunto e base ficam pro próximo.
      fotos.forEach((f) => URL.revokeObjectURL(f.previa));
      setFotos([]);
      setLegenda("");
      setLegendaDaIa(false);
      setAvisosLegenda([]);
      setNome("");
      setTitulo("");
      setCarroId("");
      setDados("");
    } catch (e) {
      setEnviando(null);
      setErro(`Deu erro: ${e instanceof Error ? e.message : String(e)}`.slice(0, 250));
    }
  }

  const campo = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-60";
  const rotulo = "text-xs uppercase tracking-wide font-medium text-foreground-muted";

  return (
    <div className="flex flex-col gap-5">
      {!escritaLiberada && (
        <p className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          O acesso de escrita na Meta ainda não está configurado no sistema, então não dá pra subir anúncio por aqui.
        </p>
      )}

      {resultado?.ok && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col gap-2">
          <p className="font-medium flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-600" /> Anúncio criado — PAUSADO</p>
          <p className="text-sm">
            Ele ainda <strong>não está no ar</strong> e não gasta nada. Confere no Gerenciador e publica lá.
            {resultado.formato === "carrossel" ? " (Carrossel.)" : " (Foto única.)"}
          </p>
          {resultado.avisos && resultado.avisos.length > 0 && (
            <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
              {resultado.avisos.map((a, i) => <li key={i}>{a.texto}</li>)}
            </ul>
          )}
          {resultado.linkDoGerenciador && (
            <a href={resultado.linkDoGerenciador} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 self-start px-3.5 py-2 bg-accent text-white rounded-lg text-sm font-medium">
              Abrir no Gerenciador <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      {/* 1. Onde vai ficar */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">1. Onde o anúncio vai ficar</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Campanha</span>
            <select className={campo} value={campanhaId} onChange={(e) => escolherCampanha(e.target.value)}>
              <option value="">Escolha…</option>
              {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.status && c.status !== "ACTIVE" ? " (pausada)" : ""}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Conjunto de anúncios</span>
            <select className={campo} value={conjuntoId} disabled={!campanhaId} onChange={(e) => escolherConjunto(e.target.value)}>
              <option value="">{campanhaId ? "Escolha…" : "Escolha a campanha antes"}</option>
              {conjuntosDaCampanha.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.status && c.status !== "ACTIVE" ? " (pausado)" : ""}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="flex flex-col sm:flex-row gap-2 sm:gap-5 text-sm">
          <legend className="sr-only">Conjunto existente ou novo</legend>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="modo" checked={modo === "existente"} onChange={() => setModo("existente")} />
            Subir dentro deste conjunto
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="modo" checked={modo === "novo"} onChange={() => setModo("novo")} />
            Duplicar este conjunto inteiro e trocar o anúncio pelo do carro novo (um carro por conjunto)
          </label>
        </fieldset>
        {conjunto && modo === "existente" && (
          <p className="text-sm text-foreground-muted">
            {conjunto.orcamentoCents ? <>Orçamento do conjunto: <strong>{reais(conjunto.orcamentoCents)}</strong> por dia. </> : <>O orçamento é definido na campanha. </>}
            {sugeridoCents ? <>Sugestão pelo investimento da loja: <strong>{reais(sugeridoCents)}</strong> por dia. </> : null}
            Quem decide é você: eu não mudo orçamento nem localização, só aviso se algo destoar.
          </p>
        )}
        {modo === "novo" && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground-muted">
              O conjunto escolhido acima é o <strong>molde</strong>: a Meta copia o conjunto inteiro, com o anúncio dele, e eu troco esse
              anúncio pelo do carro novo (mantendo as configurações do molde). Tudo nasce <strong>pausado</strong>, com o nome do carro.
              O molde precisa ter <strong>um anúncio só</strong>.
              {conjunto && !conjunto.orcamentoCents ? " Esta campanha define o orçamento na campanha, então o orçamento abaixo não se aplica." : ""}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Nome do conjunto novo</span>
                <input className={campo} value={nomeConjunto} maxLength={200} placeholder={nome.trim() || "Igual ao nome do anúncio"} onChange={(e) => setNomeConjunto(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Orçamento diário (R$)</span>
                <input
                  className={campo}
                  inputMode="decimal"
                  value={orcamento}
                  disabled={!!conjunto && !conjunto.orcamentoCents}
                  placeholder={conjunto?.orcamentoCents ? `${(conjunto.orcamentoCents / 100).toLocaleString("pt-BR")} (o do molde)` : "o do molde"}
                  onChange={(e) => setOrcamento(e.target.value)}
                />
              </label>
            </div>
            {sugeridoCents ? <p className="text-xs text-foreground-muted">Sugestão pelo investimento da loja: {reais(sugeridoCents)} por dia (pra loja toda).</p> : null}
            {conjuntoJaCriado && conjuntoJaCriado.molde === conjuntoId && (
              <p className="text-sm text-amber-600 dark:text-amber-400">O conjunto &quot;{conjuntoJaCriado.nome}&quot; já foi criado na tentativa anterior: vou subir o anúncio nele.</p>
            )}
          </div>
        )}
      </section>

      {/* 2. O anúncio base */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">2. Qual anúncio duplicar</h2>
        <p className="text-sm text-foreground-muted">Do anúncio escolhido eu copio a página que assina, o botão e o rastreamento. Troco só as fotos, a legenda, o título e (se você quiser) o link. Funciona com anúncio de foto ou carrossel.</p>
        <select className={campo} value={baseId} disabled={!conjuntoId} onChange={(e) => void escolherBase(e.target.value)}>
          <option value="">{conjuntoId ? "Escolha…" : "Escolha o conjunto antes"}</option>
          {bases.map((a) => (
            <option key={a.id} value={a.id}>
              {a.conjuntoId === conjuntoId ? "● " : ""}{a.nome}{a.status && a.status !== "ACTIVE" ? " (pausado)" : ""}
            </option>
          ))}
        </select>
        {base.carregando && <p className="text-sm text-foreground-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Lendo o anúncio na Meta…</p>}
        {base.erro && <p className="text-sm text-red-500 flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" /> {base.erro}</p>}
        {base.formato && !base.erro && (
          <div className="text-sm">
            <p>Ok: é um anúncio de {base.formato === "carrossel" ? "carrossel" : "foto"}. Dá pra duplicar.</p>
            {base.legenda && (
              <button type="button" onClick={() => setDoBaseAberto((v) => !v)} className="text-accent underline underline-offset-2 mt-1">
                {doBaseAberto ? "Esconder" : "Ver"} a legenda dele (é de outro carro)
              </button>
            )}
            {doBaseAberto && base.legenda && <pre className="mt-2 whitespace-pre-wrap text-xs bg-background border border-border rounded-lg p-3 max-h-48 overflow-auto">{base.legenda}</pre>}
          </div>
        )}
      </section>

      {/* 3. O carro */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">3. O carro</h2>
        {estoque.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Escolher do estoque do site (opcional)</span>
            <select className={campo} value={carroId} onChange={(e) => escolherCarro(e.target.value)}>
              <option value="">Escolha pra preencher sozinho…</option>
              {estoque.map((c) => <option key={c.id} value={c.id}>{c.titulo}{c.ano ? ` · ${c.ano}` : ""}{c.precoCents ? ` · ${reais(c.precoCents)}` : ""}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Dados do carro (a IA só usa o que estiver aqui)</span>
          <textarea className={`${campo} resize-y`} rows={3} value={dados} onChange={(e) => setDados(e.target.value)} placeholder="Ex.: Volkswagen Virtus 1.6 MSI automático 2021, 45.000 km, prata, R$ 68.900, único dono" />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Nome do anúncio (só aparece pra vocês)</span>
            <input className={campo} value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Título do anúncio{baseTemTitulo ? "" : " (o base não tem)"}</span>
            <input className={campo} value={titulo} maxLength={255} onChange={(e) => setTitulo(e.target.value)} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Link do anúncio</span>
          <input className={campo} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          <span className="text-xs text-foreground-muted">
            Já vem o do anúncio base (site ou WhatsApp). Só mude se quiser levar pra outro lugar.
            {carro && carro.url !== link && (
              <> <button type="button" className="text-accent underline underline-offset-2" onClick={() => setLink(carro.url)}>Usar a página deste carro no site</button></>
            )}
          </span>
        </label>
      </section>

      {/* 4. Fotos */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">4. Fotos</h2>
        <p className="text-sm text-foreground-muted">
          {fotos.length <= 1 ? "Uma foto vira anúncio de foto única; duas ou mais viram carrossel (até 10), na ordem abaixo." : `${fotos.length} fotos: vai ser um carrossel, nesta ordem.`}
        </p>
        <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void aoEscolherArquivos(e.target.files)} />
        <button type="button" disabled={lendo || fotos.length >= 10} onClick={() => entrada.current?.click()} className="self-start inline-flex items-center gap-2 px-3.5 py-2 border border-border rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-60">
          {lendo ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} {lendo ? "Preparando…" : "Escolher fotos"}
        </button>
        {avisoDeFoto && <p className="text-sm text-amber-600 dark:text-amber-400">{avisoDeFoto}</p>}
        {fotos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fotos.map((f, i) => (
              <li key={f.chave} className="border border-border rounded-lg overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.previa} alt={f.nome} className="w-full aspect-square object-cover" />
                <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                  <span className="font-medium">{i + 1}{f.hash ? " ✓" : ""}</span>
                  <span className="flex gap-1">
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="p-1 rounded hover:bg-surface-muted disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Descer" disabled={i === fotos.length - 1} onClick={() => mover(i, 1)} className="p-1 rounded hover:bg-surface-muted disabled:opacity-30"><ArrowDown size={14} /></button>
                    <button type="button" aria-label="Tirar" onClick={() => { URL.revokeObjectURL(f.previa); setFotos((fs) => fs.filter((x) => x.chave !== f.chave)); }} className="p-1 rounded hover:bg-surface-muted text-red-500"><Trash2 size={14} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5. Legenda */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">5. Legenda</h2>
          <button type="button" disabled={gerando || dados.trim().length < 8} onClick={() => void pedirLegenda()} className="inline-flex items-center gap-2 px-3.5 py-2 border border-border rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-60">
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {gerando ? "Escrevendo…" : "Escrever com IA"}
          </button>
        </div>
        {erroLegenda && <p className="text-sm text-red-500">{erroLegenda}</p>}
        {legendaDaIa && <p className="text-sm text-amber-600 dark:text-amber-400">Escrita pela IA na voz da loja. <strong>Leia e ajuste antes de subir</strong>: ela só usa os dados do carro, mas quem confere é você.</p>}
        {avisosLegenda.map((a, i) => <p key={i} className="text-sm text-red-500 flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" /> {a}</p>)}
        <textarea className={`${campo} resize-y`} rows={10} value={legenda} maxLength={2200} onChange={(e) => { setLegenda(e.target.value); setErroLegenda(null); }} placeholder="A legenda do anúncio. A do anúncio base é de outro carro, então escreva a nova ou peça pra IA." />
        <span className="text-xs text-foreground-muted self-end">{legenda.length}/2200</span>
      </section>

      {/* 6. Subir */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">6. Subir como rascunho</h2>
        <p className="text-sm text-foreground-muted">O anúncio nasce <strong>pausado</strong>. Nada vai ao ar até você publicar no Gerenciador.</p>
        {faltas.length > 0 && <p className="text-sm text-foreground-muted">Falta: {faltas.join(", ")}.</p>}
        {erro && <p className="text-sm text-red-500 flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" /> {erro}</p>}
        {resultado && !resultado.ok && resultado.avisos && resultado.avisos.length > 0 && (
          <ul className="text-sm list-disc pl-5">{resultado.avisos.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
        )}
        <button type="button" disabled={!podeSubir} onClick={() => void subir()} className="self-start inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {enviando ? <><Loader2 size={15} className="animate-spin" /> {enviando}</> : "Subir como rascunho"}
        </button>
      </section>
    </div>
  );
}
