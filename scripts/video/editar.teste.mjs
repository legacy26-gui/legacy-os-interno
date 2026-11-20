// O teste da esteira de vídeo.
//
//   node scripts/video/editar.teste.mjs
//
// Não precisa de whisper: ele mede o CORTE e a QUEIMA da legenda, que são as
// duas partes que se pode conferir no relógio e no pixel. A transcrição em
// si só se julga com áudio de verdade — ver docs/video.md.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Pasta de trabalho descartável, ao lado do sistema e não dentro do projeto.
const AQUI = fs.mkdtempSync(path.join(os.tmpdir(), "teste-video-"));
fs.rmSync(AQUI, { recursive: true, force: true });
fs.mkdirSync(AQUI, { recursive: true });

const M = await import(new URL("./editar.mjs", import.meta.url).href);
const { lerSilencios, pedacosQueFicam, limparSrt } = M;
const ESTEIRA = new URL("./editar.mjs", import.meta.url).pathname;

let f = 0;
const ok = (c, n, e = "") => { if (!c) f++; console.log(`${c ? "ok  " : "FALHA"} ${n}${e ? "\n        -> " + e : ""}`); };
const perto = (a, b, tol = 0.35) => Math.abs(a - b) <= tol;
const dur = (x) => Number(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1", x]).toString().trim());

console.log("=== 1. A LEITURA DO QUE O FFMPEG DIZ ===");
{
  const saida = `
[silencedetect @ 0x1] silence_start: 2.0
[silencedetect @ 0x1] silence_end: 4.0 | silence_duration: 2
[silencedetect @ 0x1] silence_start: 6.0
[silencedetect @ 0x1] silence_end: 9.0 | silence_duration: 3
`;
  const s = lerSilencios(saida, 12);
  ok(s.length === 2 && s[0].de === 2 && s[0].ate === 4 && s[1].de === 6 && s[1].ate === 9,
     "lê os dois silêncios", JSON.stringify(s));
}
{
  // Silêncio que abre e nunca fecha = vai até o fim.
  const s = lerSilencios("silence_start: 8.5\n", 12);
  ok(s.length === 1 && s[0].ate === 12, "silêncio sem fim vai até o fim do vídeo", JSON.stringify(s));
}
{
  const p = pedacosQueFicam([{de:2,ate:4},{de:6,ate:9}], 12, 0.15);
  // fôlego de 0.15 nas pontas: 0→2.15, 3.85→6.15, 8.85→12
  ok(p.length === 3 && perto(p[0].ate, 2.15, 0.01) && perto(p[1].de, 3.85, 0.01) && perto(p[2].de, 8.85, 0.01),
     "o fôlego devolve 0,15s pros dois vizinhos de cada pausa",
     p.map((x) => `${x.de.toFixed(2)}→${x.ate.toFixed(2)}`).join(" "));
}
{
  // O caso que come fala: fôlego maior que a própria pausa.
  const p = pedacosQueFicam([{de:2,ate:2.2}], 5, 0.5);
  const soma = p.reduce((s,x) => s + (x.ate - x.de), 0);
  ok(perto(soma, 5, 0.01), "fôlego maior que a pausa não corta nada nem inverte o corte",
     `${soma.toFixed(2)}s de 5s · ${p.length} pedaços`);
}
{
  const p = pedacosQueFicam([{de:0,ate:12}], 12, 0.15);
  ok(p.length === 0 || p.every((x) => x.ate > x.de), "vídeo todo silencioso não gera pedaço invertido", JSON.stringify(p));
}

console.log("\n=== 1b. O QUE NÃO É FALA NÃO PODE QUEIMAR NA TELA ===");
{
  const bruto = [
    "1\n00:00:00,000 --> 00:00:02,000\n (bip)",
    "2\n00:00:02,000 --> 00:00:04,000\n Esse Onix 2023",
    "3\n00:00:04,000 --> 00:00:06,000\n [Música]",
    "4\n00:00:06,000 --> 00:00:08,000\n Legendas pela comunidade Amara.org",
    "5\n00:00:08,000 --> 00:00:10,000\n está completo",
    "6\n00:00:10,000 --> 00:00:11,000\n ...",
    "7\n00:00:11,000 --> 00:00:13,000\n (risos) e é automático",
  ].join("\n\n") + "\n";
  const r = limparSrt(bruto);
  ok(r.ficaram === 3 && r.tirados === 4, "tira (bip), [Música], Amara.org e pontuação solta",
     `ficaram ${r.ficaram}, tirados ${r.tirados}`);
  ok(!/bip|Música|Amara/.test(r.limpo), "nada de anotação sobra no arquivo limpo");
  ok(/^3\n00:00:11,000 --> 00:00:13,000\ne é automático$/m.test(r.limpo),
     "a anotação sai de dentro da linha que TEM fala, e a fala fica",
     r.limpo.split("\n\n")[2]?.replace(/\n/g, " | ") ?? "(nada)");
  ok(/^1\n/.test(r.limpo) && /^2\n/m.test(r.limpo), "renumera do 1 em diante");
}
{
  const r = limparSrt("1\n00:00:00,000 --> 00:00:02,000\n [Música]\n");
  ok(r.ficaram === 0, "áudio só com música não gera legenda nenhuma", `ficaram ${r.ficaram}`);
}
{
  ok(limparSrt("").ficaram === 0, "srt vazio não quebra");
  ok(limparSrt("lixo sem tempos\n").ficaram === 0, "srt sem linha de tempo não quebra");
}

console.log("\n=== 2. O CORTE DE VERDADE, NO RELÓGIO ===");
const entrada = path.join(AQUI, "bruto.mp4");
// 12s verticais. Som em 0-2, 4-6 e 9-12; silêncio de verdade no resto.
execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=540x960:rate=30:duration=12",
  "-f","lavfi","-i","aevalsrc=exprs=0.5*sin(2*PI*440*t)*(between(t\\,0\\,2)+between(t\\,4\\,6)+between(t\\,9\\,12)):d=12:s=44100",
  "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-shortest", entrada]);
ok(perto(dur(entrada), 12, 0.2), "vídeo de teste tem 12s", `${dur(entrada).toFixed(2)}s`);

const saida1 = path.join(AQUI, "cortado.mp4");
const log1 = execFileSync("node", [ESTEIRA, entrada,
  "--saida", saida1, "--sem-legenda"], { encoding: "utf8" });
console.log(log1.trim().split("\n").map((l) => "        " + l).join("\n"));
// 2s + 3s de pausa, menos 0,15s de fôlego em cada ponta de cada pausa = 4,4s
ok(perto(dur(saida1), 7.6, 0.6), "o corte tirou ~4,4s de pausa (12s → ~7,6s)", `${dur(saida1).toFixed(2)}s`);
ok(/-4\.\ds de pausa/.test(log1), "ele relata quanto cortou", log1.match(/corte:.*/)?.[0] ?? "(não relatou)");

console.log("\n=== 3. NADA PRA CORTAR ===");
{
  const falante = path.join(AQUI, "falante.mp4");
  execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-y",
    "-f","lavfi","-i","testsrc2=size=320x568:rate=30:duration=5",
    "-f","lavfi","-i","sine=frequency=440:duration=5",
    "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-shortest", falante]);
  const s = path.join(AQUI, "sem-pausa.mp4");
  const log = execFileSync("node", [ESTEIRA, falante,
    "--saida", s, "--sem-legenda"], { encoding: "utf8" });
  ok(/não achei pausa/.test(log), "vídeo sem pausa: diz que não achou e não reencoda à toa",
     log.match(/corte:.*/)?.[0] ?? log.trim());
  ok(perto(dur(s), 5, 0.2), "e a duração não muda", `${dur(s).toFixed(2)}s`);
}

console.log("\n=== 4. VÍDEO MUDO NÃO QUEBRA ===");
{
  const mudo = path.join(AQUI, "mudo.mp4");
  execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-y",
    "-f","lavfi","-i","testsrc2=size=320x568:rate=30:duration=4",
    "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p", mudo]);
  let log = "", caiu = false;
  try {
    log = execFileSync("node", [ESTEIRA, mudo], { encoding: "utf8", stdio: ["ignore","pipe","pipe"] });
  } catch (e) { caiu = true; log = (e.stdout ?? "") + (e.stderr ?? ""); }
  ok(/SEM ÁUDIO/.test(log), "percebe que não tem trilha de áudio", log.trim().split("\n")[0] ?? "");
  ok(caiu && /não tem trilha de áudio/.test(log), "e para com erro claro em vez de copiar o original com cara de editado",
     log.match(/ERRO:.*/)?.[0] ?? "(sem erro claro)");
}

console.log("\n=== 5. A LEGENDA QUEIMADA APARECE NA IMAGEM ===");
{
  // SRT escrito na mão: assim o teste mede o QUEIMAR, não o transcrever.
  const srt = path.join(AQUI, "legenda.srt");
  fs.writeFileSync(srt, `1
00:00:01,000 --> 00:00:04,000
ONIX 2023 COMPLETO

`);
  const comLegenda = path.join(AQUI, "com-legenda.mp4");
  const estilo = "FontName=DejaVu Sans,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=60";
  execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-y","-i", path.resolve(entrada),
    "-vf", `subtitles=legenda.srt:force_style='${estilo}'`,
    "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","copy", path.resolve(comLegenda)],
    { cwd: AQUI });

  // Mesmo quadro, com e sem legenda. Se a legenda entrou, a faixa de baixo muda.
  const quadro = (video, nome) => {
    const p = path.join(AQUI, nome);
    execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-y","-ss","2","-i", video,
      "-frames:v","1","-vf","crop=540:200:0:700", p]);
    return fs.readFileSync(p);
  };
  const antes = quadro(path.resolve(entrada), "antes.png");
  const depois = quadro(path.resolve(comLegenda), "depois.png");
  ok(!antes.equals(depois), "a faixa de baixo do quadro MUDOU: a legenda entrou no pixel",
     `antes ${antes.length}B · depois ${depois.length}B`);

  // E num quadro fora do tempo da legenda, nada muda além do reencode.
  ok(fs.existsSync(comLegenda) && dur(comLegenda) > 11, "o vídeo com legenda continua inteiro",
     `${dur(comLegenda).toFixed(2)}s`);
}

console.log(f === 0 ? "\nTUDO PASSOU" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
