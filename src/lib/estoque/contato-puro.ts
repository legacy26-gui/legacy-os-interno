// O contato da loja lido da página inicial do site: WhatsApp, telefone e endereço — pro rodapé da legenda não sair genérico.
// Puro (testável). Cada site escreve de um jeito: lê o que é seguro (link wa.me, dados estruturados ld+json, link tel:,
// endereço com número) e, na dúvida, deixa vazio. A pessoa confere e edita na tela antes de usar.

export interface ContatoDaLoja {
  whatsapp: string | null;
  telefone: string | null;
  endereco: string | null;
}

/** "5542984399009" / "42984399009" → "(42) 98439-9009". Devolve null se não parecer telefone brasileiro. */
export function formatarTelefone(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return null;
}

const ehCelular = (formatado: string) => /^\(\d\d\) 9\d{4}-\d{4}$/.test(formatado);

function decodificar(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ordm;/g, "º")
    .replace(/&deg;/g, "°");
}

function blocosLdJson(html: string): unknown[] {
  const saida: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const lista = Array.isArray(j) ? j : Array.isArray(j?.["@graph"]) ? j["@graph"] : [j];
      saida.push(...lista);
    } catch {
      /* bloco quebrado: ignora */
    }
  }
  return saida;
}

function enderecoDoLd(a: unknown): string | null {
  if (!a || typeof a !== "object") return typeof a === "string" && a.trim().length > 5 ? a.trim() : null;
  const o = a as Record<string, unknown>;
  const partes = [o.streetAddress, o.addressLocality, o.addressRegion].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  return partes.length ? partes.join(" - ") : null;
}

export function lerContatoDoHtml(html: string): ContatoDaLoja {
  let whatsapp: string | null = null;
  let telefone: string | null = null;
  let endereco: string | null = null;

  // 1. WhatsApp: o link é a fonte mais certa.
  const wa = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\/?\?phone=)\+?(\d{10,13})/i);
  if (wa) whatsapp = formatarTelefone(wa[1]);

  // 2. Dados estruturados (ld+json): telefone e endereço.
  for (const b of blocosLdJson(html)) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    if (!telefone && typeof o.telephone === "string") telefone = formatarTelefone(o.telephone);
    if (!endereco && o.address) endereco = enderecoDoLd(o.address);
  }

  // 3. Links tel:
  for (const m of html.matchAll(/href=["']tel:([+\d\s().-]{8,20})["']/gi)) {
    const f = formatarTelefone(m[1]);
    if (!f) continue;
    if (!telefone) telefone = f;
    if (!whatsapp && ehCelular(f)) whatsapp = f;
  }
  if (!whatsapp && telefone && ehCelular(telefone)) whatsapp = telefone;

  // 4. Endereço escrito na página (só o texto visível; precisa ter número).
  if (!endereco) {
    const texto = decodificar(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, "\n"),
    );
    const m = texto.match(/\b(?:Rua|R\.|Av\.|Avenida|Rodovia|Rod\.|Estrada|Alameda|Travessa|Marginal)\s+[A-ZÀ-Úa-zà-ú0-9][^\n<>{}();=|]{2,80}?\d{1,5}[^\n<>{}();=|]{0,60}/);
    if (m) endereco = m[0].replace(/\s+/g, " ").replace(/[\s,·-]+$/, "").trim();
  }
  if (endereco) endereco = decodificar(endereco).replace(/\s+/g, " ").trim().slice(0, 160);

  return { whatsapp, telefone: telefone === whatsapp ? null : telefone, endereco };
}

/** O rodapé sugerido pra legenda: endereço e WhatsApp (ou telefone). Vazio se o site não disse nada. */
export function rodapeSugerido(c: ContatoDaLoja): string {
  return [c.endereco ? `📍 ${c.endereco}` : null, c.whatsapp ? `📲 WhatsApp: ${c.whatsapp}` : null, c.telefone ? `📞 ${c.telefone}` : null].filter(Boolean).join("\n");
}
