// Mede regiao de verdade: materializa o recorte antes do stats().
import sharp from "sharp";
export async function media(arquivo, r) {
  const corte = await sharp(arquivo).extract(r).toBuffer();
  const { channels } = await sharp(corte).stats();
  return channels.slice(0, 3).map((c) => Math.round(c.mean));
}
