import sharp from "sharp";
import { readFileSync } from "node:fs";
const reg = JSON.parse(readFileSync("saida/registro.json","utf8"));
const L = 520, G = 18, ROT = 56;

function rotulo(texto, sub, largura) {
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${ROT}" viewBox="0 0 ${largura} ${ROT}">
    <rect width="${largura}" height="${ROT}" fill="#111113"/>
    <text x="14" y="24" font-family="DejaVu Sans" font-size="19" font-weight="bold" fill="#fff">${esc(texto)}</text>
    <text x="14" y="45" font-family="DejaVu Sans" font-size="15" fill="#9aa0a6">${esc(sub)}</text></svg>`);
}

async function faixa(itens, saida) {
  const cols = await Promise.all(itens.map(async (i) => {
    const arte = await sharp(i.arquivo).resize(L, L, { fit: "cover" }).toBuffer();
    return sharp({ create: { width: L, height: L + ROT, channels: 3, background: "#111113" } })
      .composite([{ input: rotulo(i.titulo, i.sub, L), top: 0, left: 0 }, { input: arte, top: ROT, left: 0 }])
      .png().toBuffer();
  }));
  const larg = L * cols.length + G * (cols.length + 1);
  await sharp({ create: { width: larg, height: L + ROT + G * 2, channels: 3, background: "#0A0A0B" } })
    .composite(cols.map((c, n) => ({ input: c, top: G, left: G + n * (L + G) })))
    .jpeg({ quality: 92 }).toFile(saida);
  console.log(saida);
}

const n = (x) => x.toFixed(1).replace(".", ",");
await faixa(reg.propostas.map((p) => ({
  arquivo: `saida/proposta-${p.n}-feed.jpg`,
  titulo: `${p.n}. ${p.plano.nome}`,
  sub: `nota ${n(p.media)} · ${p.passou ? "aprovada" : "reprovada"} · ${p.plano.conceito.slice(0,58)}`,
})), "saida/COMPARAR-3-PROPOSTAS.jpg");

const r = reg.ciclo.rodadas;
await faixa([
  { arquivo: "saida/correcao-0-feed.jpg", titulo: "Antes — reprovada", sub: `nota ${n(r[0].media)} · enquadramento, legibilidade e hierarquia` },
  { arquivo: "saida/correcao-1-feed.jpg", titulo: "Depois — 1 rodada automática", sub: `nota ${n(r[1].media)} · ganho de ${n(reg.ciclo.ganho)} pontos, sem ninguém tocar` },
], "saida/COMPARAR-CICLO.jpg");
