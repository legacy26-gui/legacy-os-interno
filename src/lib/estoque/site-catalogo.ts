// Leitor dos sites de loja feitos em plataforma de "app" (ex.: 7pointmotors.com), que entregam a página /estoque com os carros
// EMBUTIDOS no HTML, como objetos { id, brand, model, version, year_fab, year_model, price, mileage, color, is_available,
// car_images: [{ url }] }. Um GET da página traz o estoque inteiro, com todos os dados: não precisa abrir a página de cada carro.
//
// As fotos desse tipo de site vêm com link ASSINADO que expira em ~1 hora. Por isso a foto NÃO é guardada: no "anunciar agora"
// ela é lida de novo da página do carro (/veiculo/<id>) na hora — ver fotosDaPaginaDoCatalogo.

import type { CarroLido } from "./autocerto";

export interface CarroDoCatalogo extends CarroLido {
  codigo: string;
  caminho: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const INICIO = new RegExp(`\\{id:"(${UUID})",brand:"`, "g");

/** A página parece desse tipo de site? (carros embutidos com brand/model/year_model e links /veiculo/<uuid>). Pura. */
export function pareceCatalogo(html: string): boolean {
  return new RegExp(`\\{id:"${UUID}",brand:"`).test(html) && /year_model:\d/.test(html);
}

function texto(bloco: string, campo: string): string | null {
  const m = bloco.match(new RegExp(`[,{]${campo}:"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return null;
  let v = m[1];
  try {
    v = JSON.parse(`"${v}"`) as string;
  } catch {
    // fica como veio
  }
  v = v.trim();
  return v || null;
}

function numero(bloco: string, campo: string): number | null {
  const m = bloco.match(new RegExp(`[,{]${campo}:(-?\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

/** Os carros DISPONÍVEIS embutidos na página. Um por id (o mesmo carro pode aparecer duas vezes, ex.: destaque). Pura. */
export function lerCatalogo(html: string): CarroDoCatalogo[] {
  const inicios = [...html.matchAll(INICIO)].map((m) => ({ id: m[1], pos: m.index! }));
  const vistos = new Set<string>();
  const carros: CarroDoCatalogo[] = [];
  inicios.forEach((ini, i) => {
    if (vistos.has(ini.id)) return;
    const bloco = html.slice(ini.pos, i + 1 < inicios.length ? inicios[i + 1].pos : ini.pos + 20_000);
    if (/[,{]is_available:(!1|false)/.test(bloco)) return; // vendido/oculto no site
    const marca = texto(bloco, "brand");
    const modelo = texto(bloco, "model");
    const versao = texto(bloco, "version");
    const anoModelo = numero(bloco, "year_model");
    const preco = numero(bloco, "price");
    if (!marca || !modelo) return;
    vistos.add(ini.id);
    carros.push({
      codigo: ini.id,
      caminho: `/veiculo/${ini.id}`,
      titulo: [marca, modelo, versao, anoModelo].filter(Boolean).join(" "),
      marca,
      modelo,
      versao,
      anoModelo,
      anoFabricacao: numero(bloco, "year_fab"),
      cor: texto(bloco, "color"),
      km: numero(bloco, "mileage"),
      // O site guarda em reais inteiros (234900 = R$ 234.900,00).
      precoCents: preco !== null && preco > 0 ? Math.round(preco * 100) : null,
      foto: null, // link assinado que expira: não se guarda (ver o topo do arquivo)
    });
  });
  return carros;
}

/** As fotos do carro na página dele: os links que apontam pra pasta das imagens DESTE carro (car-images/<id>/), em ordem. Pura. */
export function fotosDaPaginaDoCatalogo(html: string, paginaUrl: string): string[] {
  const id = paginaUrl.match(new RegExp(`/veiculo/(${UUID})`))?.[1];
  if (!id) return [];
  const urls: string[] = [];
  for (const m of html.matchAll(/url:"(https:\/\/[^"]+)"/g)) {
    let u = m[1];
    try {
      u = JSON.parse(`"${u}"`) as string;
    } catch {
      // fica como veio
    }
    if (u.includes(`/car-images/${id}/`) && !urls.includes(u)) urls.push(u);
  }
  return urls;
}
