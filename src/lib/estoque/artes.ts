import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { escolherCarroPeloArquivo, type CarroParaArte } from "@/lib/estoque/artes-puro";

// O banco de artes: a arte que o designer fez pra cada carro. Regras (decisão do Guilherme):
// 1. a arte é SEMPRE a 1ª foto do anúncio;
// 2. a proporção dela vale pro anúncio todo — as outras fotos (do site) são cortadas na mesma proporção.

export { escolherCarroPeloArquivo };

/** Maior lado guardado: a Meta recomenda 1080; 1440 deixa folga sem pesar no banco. */
const LADO_MAXIMO = 1440;
export const TAMANHO_MAXIMO_DA_ARTE = 15 * 1024 * 1024;

/** Lê a arte enviada, vira JPEG e diminui se for grande. Recusa o que não for imagem. */
export async function prepararArte(bytes: Buffer): Promise<{ ok: true; bytes: Buffer; largura: number; altura: number } | { ok: false; erro: string }> {
  if (bytes.length === 0) return { ok: false, erro: "arquivo vazio" };
  if (bytes.length > TAMANHO_MAXIMO_DA_ARTE) return { ok: false, erro: "arquivo maior que 15 MB" };
  try {
    const img = sharp(bytes, { failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return { ok: false, erro: "não é uma imagem" };
    const saida = await img
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, bytes: saida.data, largura: saida.info.width, altura: saida.info.height };
  } catch {
    return { ok: false, erro: "não é uma imagem (use JPG ou PNG)" };
  }
}

/**
 * Corta (pelo centro) uma foto na proporção da arte e deixa do MESMO tamanho dela: o carrossel fica uniforme e a Meta não
 * recusa foto pequena demais. Nada é esticado — o lado que sobra é cortado.
 */
export async function cortarNaProporcao(bytes: Buffer, largura: number, altura: number): Promise<Buffer | null> {
  try {
    return await sharp(bytes).rotate().resize({ width: largura, height: altura, fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * As fotos do anúncio com a arte do carro: a arte na frente e as fotos do site cortadas na proporção dela.
 * Sem arte: as fotos como vieram.
 */
export async function fotosComArte<T extends { bytes: Buffer }>(
  carroId: string,
  fotos: T[],
): Promise<{ fotos: Buffer[]; comArte: boolean; puladas: number }> {
  const arte = await prisma.arteDoCarro.findUnique({ where: { carroId }, select: { bytes: true, largura: true, altura: true } });
  if (!arte) return { fotos: fotos.map((f) => f.bytes), comArte: false, puladas: 0 };
  const saida: Buffer[] = [Buffer.from(arte.bytes)];
  let puladas = 0;
  for (const f of fotos) {
    const cortada = await cortarNaProporcao(f.bytes, arte.largura, arte.altura);
    if (cortada) saida.push(cortada);
    else puladas++;
  }
  return { fotos: saida, comArte: true, puladas };
}

/** Os carros da loja que podem receber arte (os que estão no site agora). */
export async function carrosParaArte(clientId: string): Promise<CarroParaArte[]> {
  return prisma.estoqueCarro.findMany({
    where: { clientId, sumiuEm: null },
    select: { id: true, titulo: true, marca: true, modelo: true, versao: true, anoModelo: true, codigo: true },
    orderBy: { titulo: "asc" },
  });
}
