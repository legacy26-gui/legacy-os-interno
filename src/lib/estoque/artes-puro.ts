// Adivinhar de qual carro é a arte pelo nome do arquivo ("compass-limited-2022.png", "ONIX LT 2020 final.jpg").
// Puro (testável). Só escolhe quando um carro ganha com folga; empate ou nada parecido = deixa a pessoa escolher.

export interface CarroParaArte {
  id: string;
  titulo: string;
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  anoModelo?: number | null;
  codigo?: string | null;
}

const RUIDO = new Set(["arte", "final", "post", "feed", "story", "stories", "anuncio", "copia", "copy", "img", "image", "foto", "v1", "v2", "v3", "png", "jpg", "jpeg", "webp", "de", "do", "da", "e"]);

export function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp|heic)$/i, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !RUIDO.has(p));
}

export function escolherCarroPeloArquivo(arquivo: string, carros: CarroParaArte[]): string | null {
  const doArquivo = new Set(palavras(arquivo));
  if (doArquivo.size === 0) return null;
  const notas = carros.map((c) => {
    const doCarro = new Set(palavras([c.titulo, c.marca, c.modelo, c.versao, c.anoModelo].filter(Boolean).join(" ")));
    let nota = 0;
    let modelo = false;
    for (const p of doArquivo) {
      if (!doCarro.has(p)) continue;
      // Ano conta menos (vários carros do mesmo ano); palavra do modelo conta mais.
      if (/^(19|20)\d\d$/.test(p)) nota += 1;
      else {
        nota += 2;
        if (c.modelo && palavras(c.modelo).includes(p)) modelo = true;
      }
    }
    // O código do carro no nome do arquivo ("12345.jpg") resolve sozinho.
    if (c.codigo && doArquivo.has(c.codigo.toLowerCase())) nota += 10;
    return { id: c.id, nota: modelo || nota >= 10 ? nota + 1 : nota };
  });
  notas.sort((a, b) => b.nota - a.nota);
  const [primeiro, segundo] = notas;
  if (!primeiro || primeiro.nota < 3) return null;
  if (segundo && segundo.nota === primeiro.nota) return null;
  return primeiro.id;
}

/** "4:5", "1:1", "9:16" — o nome da proporção mais próxima, pra mostrar na tela. */
export function nomeDaProporcao(largura: number, altura: number): string {
  const r = largura / altura;
  const conhecidas: [string, number][] = [["1:1", 1], ["4:5", 0.8], ["9:16", 9 / 16], ["16:9", 16 / 9], ["1.91:1", 1.91], ["3:4", 0.75], ["4:3", 4 / 3], ["2:3", 2 / 3]];
  const [nome, valor] = conhecidas.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a));
  return Math.abs(valor - r) < 0.03 ? nome : `${largura}×${altura}`;
}
