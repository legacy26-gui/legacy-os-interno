#!/usr/bin/env node
// A esteira de edição de vídeo: corta o silêncio e queima a legenda.
//
// ── Por que existe ───────────────────────────────────────────────────────
//
// A equipe grava no pátio da loja, com celular na mão. O que sai de lá tem
// duas coisas que dão trabalho manual toda vez: as pausas entre as frases e
// a legenda, que no Reels não é opcional — a maioria assiste sem som.
//
// Isto faz as duas sem ninguém abrir editor.
//
// ── Como se usa ──────────────────────────────────────────────────────────
//
//   node scripts/video/editar.mjs entrada.mp4
//   node scripts/video/editar.mjs entrada.mp4 --saida pronto.mp4
//   node scripts/video/editar.mjs entrada.mp4 --sem-legenda
//   node scripts/video/editar.mjs entrada.mp4 --silencio -35 --pausa 0.8
//
// ── O que ele precisa ter instalado ──────────────────────────────────────
//
//   ffmpeg e ffprobe        (no PATH)
//   whisper.cpp compilado   (--whisper, ou WHISPER_CLI no ambiente)
//   um modelo ggml          (--modelo, ou WHISPER_MODELO no ambiente)
//
// Sem whisper ele ainda corta o silêncio; só avisa que a legenda não sai.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── A ORDEM IMPORTA, e é o erro mais fácil de cometer aqui ───────────────
//
// Corta o silêncio PRIMEIRO, transcreve DEPOIS.
//
// Ao contrário, a legenda é feita em cima do áudio original e os tempos dela
// não valem mais nada depois do corte: cada pausa removida empurra a legenda
// pra frente, e o erro acumula até a palavra aparecer segundos longe da boca.
// É um defeito que ninguém vê rodando o script e todo mundo vê no vídeo.

// ── O vocabulário, que vale mais que trocar de modelo ────────────────────
//
// O Whisper aceita uma dica do que esperar ouvir, e no vídeo de pátio ela
// muda o resultado mais que o tamanho do modelo. Medido no primeiro vídeo
// real que chegou — um L200 Sport 2005 no pátio:
//
//   small  ................................ "4x4 Otizio"
//   small  + este vocabulário .............. "4x4 otíceo"
//   medium ................................. "4x4 Tisio"
//   medium + este vocabulário .............. "4x4, diesel."   ← certo
//
// Nenhum dos dois sozinho acertou. É a combinação.
//
// E "diesel" não é palavra qualquer: aparece em quase todo vídeo de picape e
// de SUV. Errado, ia queimado na tela.
//
// Vale por em novos nomes conforme aparecerem errados — é o lugar barato de
// consertar transcrição, bem antes de trocar de modelo.
const VOCABULARIO_DA_LOJA = [
  "Vocabulário de loja de carros:",
  "L200, Hilux, S10, Ranger, Pajero, Triton, Amarok, Toro, Strada, Saveiro,",
  "Compass, Renegade, Duster, Creta, Kicks, Tracker, HB20, Onix, Virtus,",
  "Argo, Mobi, Polo, Gol, Civic, Corolla, Fit, City, Tucson, Sportage.",
  "Turbo diesel, a diesel, flex, aspirado, 4x4, 4x2, câmbio automático,",
  "câmbio manual, único dono, IPVA pago, tabela FIPE, entrada facilitada,",
  "financiamento, camionete, caminhonete, picape, seminovo, zero quilômetro.",
].join(" ");

const USO = `
uso: node scripts/video/editar.mjs <entrada> [opções]

  --saida <arquivo>     onde gravar (padrão: <entrada>-pronto.mp4)
  --sem-corte           não mexe nas pausas
  --sem-legenda         não escreve legenda
  --silencio <dB>       o que conta como silêncio (padrão: -30)
  --pausa <seg>         pausa mínima pra ser cortada (padrão: 0.6)
  --sobra <seg>         fôlego mantido nas pontas do corte (padrão: 0.15)
  --idioma <cod>        idioma da fala (padrão: pt)
  --vocabulario <txt>   palavras que o modelo deve esperar ouvir
  --sem-vocabulario     não dá dica nenhuma ao modelo
  --whisper <caminho>   o whisper-cli
  --modelo <caminho>    o modelo ggml
  --fonte <nome>        fonte da legenda (padrão: DejaVu Sans)
`;

function lerArgumentos(argv) {
  const a = {
    entrada: null,
    saida: null,
    corte: true,
    legenda: true,
    silencio: -30,
    pausa: 0.6,
    sobra: 0.15,
    idioma: "pt",
    vocabulario: VOCABULARIO_DA_LOJA,
    whisper: process.env.WHISPER_CLI ?? null,
    modelo: process.env.WHISPER_MODELO ?? null,
    fonte: "DejaVu Sans",
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const proximo = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`falta o valor de ${t}`);
      return v;
    };
    if (t === "--sem-corte") a.corte = false;
    else if (t === "--sem-legenda") a.legenda = false;
    else if (t === "--saida") a.saida = proximo();
    else if (t === "--silencio") a.silencio = Number(proximo());
    else if (t === "--pausa") a.pausa = Number(proximo());
    else if (t === "--sobra") a.sobra = Number(proximo());
    else if (t === "--idioma") a.idioma = proximo();
    else if (t === "--vocabulario") a.vocabulario = proximo();
    else if (t === "--sem-vocabulario") a.vocabulario = "";
    else if (t === "--whisper") a.whisper = proximo();
    else if (t === "--modelo") a.modelo = proximo();
    else if (t === "--fonte") a.fonte = proximo();
    else if (t === "-h" || t === "--help") {
      console.log(USO);
      process.exit(0);
    } else if (t.startsWith("--")) throw new Error(`opção desconhecida: ${t}`);
    else if (!a.entrada) a.entrada = t;
    else throw new Error(`entrada já era "${a.entrada}", e veio "${t}"`);
  }
  if (!a.entrada) throw new Error("falta o arquivo de entrada");
  // --sem-corte junto com --sem-legenda não é erro de execução, é pedido
  // vazio: dizer isso aqui, antes de abrir arquivo nenhum, é mais honesto
  // que descobrir no fim que não havia nada pra fazer.
  if (!a.corte && !a.legenda) {
    throw new Error("--sem-corte com --sem-legenda não deixa nada pra fazer");
  }
  if (!Number.isFinite(a.silencio)) throw new Error("--silencio tem que ser número");
  if (!(a.pausa > 0)) throw new Error("--pausa tem que ser maior que zero");
  if (!(a.sobra >= 0)) throw new Error("--sobra não pode ser negativa");
  a.saida ??= a.entrada.replace(/\.[^.]+$/, "") + "-pronto.mp4";
  return a;
}

/**
 * Roda um programa e devolve o que ele escreveu. Estoura se der erro.
 *
 * `pasta` é o diretório de onde rodar — precisa existir porque o filtro de
 * legenda do ffmpeg usa ":" pra separar parâmetros e não engole caminho
 * absoluto com dois-pontos. Ver queimar().
 */
function rodar(programa, argumentos, { mostrar = false, pasta } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(programa, argumentos, pasta ? { cwd: pasta } : undefined);
    let saida = "";
    let erro = "";
    p.stdout.on("data", (d) => {
      saida += d;
      if (mostrar) process.stdout.write(d);
    });
    p.stderr.on("data", (d) => {
      erro += d;
    });
    p.on("error", (e) =>
      reject(
        new Error(
          e.code === "ENOENT"
            ? `não achei "${programa}". Está instalado e no PATH?`
            : e.message,
        ),
      ),
    );
    p.on("close", (codigo) => {
      if (codigo === 0) resolve({ saida, erro });
      // As últimas linhas, porque ffmpeg escreve páginas e o que explica
      // está sempre no fim.
      else reject(new Error(`${programa} falhou (${codigo}):\n${erro.trim().split("\n").slice(-12).join("\n")}`));
    });
  });
}

async function duracao(arquivo) {
  const { saida } = await rodar("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    arquivo,
  ]);
  const d = Number(saida.trim());
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error(`não consegui ler a duração de ${arquivo}`);
  }
  return d;
}

/** Tem trilha de áudio? Vídeo mudo não tem silêncio pra cortar nem fala. */
async function temAudio(arquivo) {
  const { saida } = await rodar("ffprobe", [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    arquivo,
  ]);
  return saida.trim().length > 0;
}

// ── 1. Achar o silêncio ──────────────────────────────────────────────────

/**
 * Os pedaços de silêncio, do jeito que o ffmpeg conta.
 *
 * O `silencedetect` escreve no stderr linhas assim:
 *   [silencedetect @ …] silence_start: 3.52
 *   [silencedetect @ …] silence_end: 5.11 | silence_duration: 1.59
 */
export function lerSilencios(stderr, total) {
  const silencios = [];
  let inicio = null;
  for (const linha of stderr.split("\n")) {
    const abriu = linha.match(/silence_start:\s*(-?[\d.]+)/);
    if (abriu) {
      inicio = Math.max(0, Number(abriu[1]));
      continue;
    }
    const fechou = linha.match(/silence_end:\s*([\d.]+)/);
    if (fechou && inicio !== null) {
      silencios.push({ de: inicio, ate: Number(fechou[1]) });
      inicio = null;
    }
  }
  // Silêncio que começou e nunca fechou vai até o fim do vídeo.
  if (inicio !== null) silencios.push({ de: inicio, ate: total });
  return silencios;
}

/**
 * O que SOBRA depois de tirar os silêncios — com fôlego nas pontas.
 *
 * ── Por que o fôlego ──────────────────────────────────────────────────────
 *
 * Porque o detector marca o silêncio onde o som cai abaixo do limite, e isso
 * é DENTRO da palavra: o fim de "boa" e o começo de "tarde" são mais baixos
 * que o meio delas. Cortar exatamente ali come o começo e o fim de cada
 * frase, e o vídeo fica com a fala picada — defeito que parece erro de
 * gravação, não de edição.
 *
 * Então cada pedaço de silêncio devolve um pouco de si pros dois vizinhos.
 */
export function pedacosQueFicam(silencios, total, sobra) {
  const ficam = [];
  let cursor = 0;
  for (const s of silencios) {
    const comecaOCorte = Math.min(s.de + sobra, s.ate);
    const terminaOCorte = Math.max(s.ate - sobra, comecaOCorte);
    if (comecaOCorte > cursor) ficam.push({ de: cursor, ate: comecaOCorte });
    cursor = Math.max(cursor, terminaOCorte);
  }
  if (cursor < total) ficam.push({ de: cursor, ate: total });
  // Lascas de quadro só engordam o filtro e não se vêem.
  return ficam.filter((p) => p.ate - p.de > 0.04);
}

/** A expressão de seleção do ffmpeg pros pedaços que ficam. */
function expressaoDeCorte(pedacos) {
  return pedacos
    .map((p) => `between(t,${p.de.toFixed(3)},${p.ate.toFixed(3)})`)
    .join("+");
}

async function cortarSilencio(entrada, saida, a, total) {
  const { erro } = await rodar("ffmpeg", [
    "-hide_banner", "-i", entrada,
    "-af", `silencedetect=noise=${a.silencio}dB:d=${a.pausa}`,
    "-f", "null", "-",
  ]);
  const silencios = lerSilencios(erro, total);
  const ficam = pedacosQueFicam(silencios, total, a.sobra);

  if (ficam.length === 0) {
    throw new Error(
      "o vídeo inteiro foi considerado silêncio. Tenta --silencio -40 " +
        "(mais tolerante) ou --pausa 1.5 (só corta pausa longa).",
    );
  }
  const ficou = ficam.reduce((s, p) => s + (p.ate - p.de), 0);
  // Nada a cortar: devolve o original e evita um reencode à toa.
  if (silencios.length === 0 || ficou >= total - 0.05) {
    return { arquivo: entrada, cortou: 0, pedacos: 1, reencodou: false };
  }

  const sel = expressaoDeCorte(ficam);
  await rodar("ffmpeg", [
    "-hide_banner", "-y", "-i", entrada,
    // select e aselect com a MESMA expressão: vídeo e áudio têm que sair
    // pelos mesmos pontos, senão a boca desencontra da voz.
    "-vf", `select='${sel}',setpts=N/FRAME_RATE/TB`,
    "-af", `aselect='${sel}',asetpts=N/SR/TB`,
    // Corte no meio do GOP não existe em cópia de stream: tem que reencodar.
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ]);
  return {
    arquivo: saida,
    cortou: total - ficou,
    pedacos: ficam.length,
    reencodou: true,
  };
}

// ── 2. Transcrever ───────────────────────────────────────────────────────

/**
 * Gera o .srt com o whisper.cpp.
 *
 * O áudio vai pra 16 kHz mono porque é o que o modelo espera; mandar 48 kHz
 * estéreo faz ele reamostrar sozinho e às vezes errar o alinhamento.
 *
 * `-ml 16 --split-on-word` é o que dá legenda de Reels: pedaço curto, duas ou
 * três palavras, trocando rápido. O padrão do whisper é frase inteira, que
 * numa tela de celular vira parede de texto.
 */
async function transcrever(video, pasta, a) {
  const wav = path.join(pasta, "fala.wav");
  await rodar("ffmpeg", [
    "-hide_banner", "-y", "-i", video,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    wav,
  ]);
  const base = path.join(pasta, "legenda");
  await rodar(a.whisper, [
    "-m", a.modelo,
    "-f", wav,
    "-l", a.idioma,
    "-osrt", "-of", base,
    "-ml", "16", "--split-on-word",
    // Ver VOCABULARIO_DA_LOJA: vale mais que trocar de modelo.
    ...(a.vocabulario ? ["--prompt", a.vocabulario] : []),
  ]);
  const srt = `${base}.srt`;
  if (!fs.existsSync(srt)) throw new Error("o whisper não gerou o .srt");
  return srt;
}

// ── 2b. Limpar o que não é fala ──────────────────────────────────────────
//
// ── Por que isto é obrigatório, e não enfeite ────────────────────────────
//
// O Whisper não transcreve só fala: ele ANOTA o que ouve. Rodando num apito
// puro, ele devolveu "(bip)" três vezes, nos tempos exatos — está certo, e é
// exatamente o que não pode aparecer na tela. Num vídeo de pátio ele vira
// "(música)", "[Música]", "(risos)", "(ruído de motor)".
//
// Pior que isso: em trecho sem fala o modelo às vezes INVENTA, e a invenção
// mais famosa dele é crédito de legendador — "Legendas pela comunidade
// Amara.org". Queimado em cima do carro de um cliente.
//
// Nada disso dá pra consertar depois: a legenda está dentro da imagem.

const LIXO_CONHECIDO = [
  /amara\.org/i,
  /legendas?\s+(pela|por|da)\s+comunidade/i,
  /subtitles?\s+by/i,
  /transcri(ption|ção)\s+by/i,
];

/**
 * Tira do .srt o que não é fala, e renumera o que sobrou.
 *
 * Devolve o texto limpo e quantos trechos caíram, porque "tirei 14 de 15" é
 * sinal de que o áudio não tinha fala nenhuma — e quem rodou precisa saber
 * disso em vez de receber um vídeo sem legenda sem explicação.
 */
export function limparSrt(bruto) {
  const blocos = bruto.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  const ficam = [];
  let tirados = 0;

  for (const bloco of blocos) {
    const linhas = bloco.split("\n");
    // 0 = número, 1 = tempos, resto = texto.
    const tempos = linhas.findIndex((l) => l.includes("-->"));
    if (tempos === -1) continue;
    const texto = linhas.slice(tempos + 1).join(" ").trim();

    // Sobra alguma coisa depois de tirar as anotações entre (), [] e **?
    const falaDeVerdade = texto
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\*[^*]*\*/g, " ")
      // Letra, número ou acento. Pontuação sozinha não é fala.
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();

    if (!falaDeVerdade || LIXO_CONHECIDO.some((r) => r.test(texto))) {
      tirados++;
      continue;
    }

    // Trecho que tem fala E anotação ("(risos) e é automático") fica, mas a
    // anotação sai: ela não foi dita e não tem o que fazer na tela.
    const soAFala = texto
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    ficam.push({ tempos: linhas[tempos].trim(), texto: soAFala });
  }

  const limpo = ficam
    .map((b, i) => `${i + 1}\n${b.tempos}\n${b.texto}`)
    .join("\n\n");
  return { limpo: limpo ? limpo + "\n" : "", ficaram: ficam.length, tirados };
}

// ── 3. Queimar a legenda ─────────────────────────────────────────────────

/**
 * Escreve a legenda DENTRO da imagem.
 *
 * Queimada e não como faixa separada porque Instagram e TikTok ignoram faixa
 * de legenda: o que não está na imagem não existe lá.
 *
 * O caminho do .srt vai como nome simples e com a pasta no `fontsdir`, porque
 * o filtro `subtitles` usa ":" pra separar os próprios parâmetros e um
 * caminho absoluto com dois-pontos quebra o filtro de um jeito difícil de ler
 * no erro.
 */
async function queimar(video, srt, saida, a) {
  const estilo = [
    `FontName=${a.fonte}`,
    "FontSize=16",
    "Bold=1",
    // Branco com contorno preto grosso: é o que se lê em cima de carro
    // escuro, de asfalto claro e de céu estourado, sem precisar de tarja.
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=3",
    "Shadow=0",
    // Embaixo e no centro, acima da área onde o Reels põe os botões.
    "Alignment=2",
    "MarginV=60",
  ].join(",");

  await rodar("ffmpeg", [
    "-hide_banner", "-y", "-i", video,
    "-vf", `subtitles=${path.basename(srt)}:force_style='${estilo}'`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "copy",
    "-movflags", "+faststart",
    path.resolve(saida),
  ], { pasta: path.dirname(srt) });
}

// ── A esteira ────────────────────────────────────────────────────────────

async function principal() {
  const a = lerArgumentos(process.argv.slice(2));
  if (!fs.existsSync(a.entrada)) {
    throw new Error(`não achei o arquivo "${a.entrada}"`);
  }

  const total = await duracao(a.entrada);
  const comSom = await temAudio(a.entrada);
  console.log(`entrada: ${a.entrada} · ${total.toFixed(1)}s${comSom ? "" : " · SEM ÁUDIO"}`);

  // ── Vídeo mudo ──────────────────────────────────────────────────────────
  //
  // As duas coisas que esta esteira faz dependem da fala: a pausa que se
  // corta é pausa de som, e a legenda vem do que foi dito. Num vídeo sem
  // trilha de áudio não há o que fazer.
  //
  // Erro, e não cópia silenciosa do original: copiar devolveria um arquivo
  // novo, com cara de editado, idêntico ao que entrou — e quem recebesse
  // acharia que a legenda simplesmente não apareceu.
  if (!comSom) {
    throw new Error(
      "este vídeo não tem trilha de áudio: não há pausa pra cortar nem fala " +
        "pra transcrever",
    );
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-video-"));
  try {
    let atual = a.entrada;

    if (a.corte) {
      const r = await cortarSilencio(atual, path.join(pasta, "cortado.mp4"), a, total);
      atual = r.arquivo;
      console.log(
        r.reencodou
          ? `corte: -${r.cortou.toFixed(1)}s de pausa, ${r.pedacos} pedaços colados`
          : "corte: não achei pausa pra tirar",
      );
    }

    if (a.legenda) {
      if (!a.whisper || !a.modelo) {
        console.log(
          "legenda: PULADA — falta --whisper e/ou --modelo " +
            "(ou WHISPER_CLI e WHISPER_MODELO no ambiente)",
        );
        a.legenda = false;
      } else {
        const srt = await transcrever(atual, pasta, a);
        const { limpo, ficaram, tirados } = limparSrt(
          fs.readFileSync(srt, "utf8"),
        );
        console.log(
          `legenda: ${ficaram} trechos de fala` +
            (tirados ? ` (${tirados} descartados: som que não é fala)` : ""),
        );
        if (ficaram === 0) {
          throw new Error(
            "não achei fala nenhuma neste áudio. Se tem fala, tenta " +
              "--idioma pt (ou o idioma certo) e confere se o som não está " +
              "muito baixo.",
          );
        }
        fs.writeFileSync(srt, limpo);
        await queimar(atual, srt, a.saida, a);
      }
    }

    if (!a.legenda) {
      // Sem legenda, o arquivo final é o que saiu do corte — e quando o corte
      // não achou pausa nenhuma, é o próprio original.
      //
      // Antes isto estourava com "não há nada pra fazer", e era defeito: quem
      // pede corte num vídeo já enxuto pediu uma coisa legítima e tem que
      // receber o arquivo, não um erro. O teste pegou.
      if (path.resolve(atual) !== path.resolve(a.saida)) {
        fs.copyFileSync(atual, a.saida);
      }
    }

    const d = await duracao(a.saida);
    const kb = (fs.statSync(a.saida).size / 1024 / 1024).toFixed(1);
    console.log(`pronto: ${a.saida} · ${d.toFixed(1)}s · ${kb} MB`);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

// Rodado direto (não importado por um teste).
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  principal().catch((e) => {
    console.error(`\nERRO: ${e.message}`);
    process.exit(1);
  });
}
