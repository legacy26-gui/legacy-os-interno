// A conversa com a OpenAI, com a conta correndo do lado.
//
// Toda chamada passa por aqui por um motivo só: o custo. A pergunta "quanto
// custa uma arte" não pode depender de alguém lembrar de somar. Cada resposta
// traz quantos tokens gastou; aqui isso vira centavo na hora e fica num
// caderninho que o relatório final lê.

import { readFileSync } from "node:fs";

const CHAVE = readFileSync(new URL(".chave", import.meta.url), "utf8").trim();

/** Dólar. Só pra falar em real no relatório; o registro guarda os dois. */
export const DOLAR = 5.4;

/** US$ por milhão de tokens. Conferido na tabela da OpenAI em nov/2026. */
const PRECO = {
  "gpt-4.1": { entrada: 2.0, saida: 8.0 },
  "gpt-4o": { entrada: 2.5, saida: 10.0 },
  "gpt-image-2": { entrada: 8.0, saida: 30.0 },
};

/** O caderninho. Uma linha por chamada. */
export const gastos = [];

/**
 * Repete o que falhou por motivo passageiro.
 *
 * ── Por que não dá pra viver sem isto ────────────────────────────────────
 *
 * Uma arte são de 4 a 8 chamadas em sequência, e a imagem leva 30 segundos
 * cada. Um tropeço de DNS na sexta chamada — foi o que aconteceu — derruba a
 * fábrica inteira e joga fora o que já tinha sido pago. Com repetição, custa
 * quinze segundos.
 *
 * Só repete o que é passageiro: rede, 429 (fila cheia) e 5xx (lado deles).
 * 400 e 401 são erro nosso e repetir não conserta, só gasta de novo.
 */
const ESPERAS_MS = [2000, 6000, 15000];

async function comRepeticao(etapa, tentar) {
  for (let i = 0; ; i++) {
    try {
      return await tentar();
    } catch (e) {
      if (!e.passageiro || i >= ESPERAS_MS.length) throw e;
      console.log(`     ${etapa}: ${e.message} — repetindo em ${ESPERAS_MS[i] / 1000}s`);
      await new Promise((ok) => setTimeout(ok, ESPERAS_MS[i]));
    }
  }
}

function passageiro(e) {
  e.passageiro = true;
  return e;
}

/** Lê a resposta tratando corpo que não é JSON (página de erro do proxy). */
async function corpo(r, etapa) {
  const texto = await r.text();
  try {
    return JSON.parse(texto);
  } catch {
    const curto = texto.slice(0, 120).replace(/\s+/g, " ");
    const e = new Error(`${etapa}: resposta ${r.status} não era JSON — ${curto}`);
    throw r.ok || r.status >= 500 ? passageiro(e) : e;
  }
}

function conferir(r, j, etapa) {
  if (r.ok) return;
  const msg = `${etapa}: ${r.status} ${j?.error?.message ?? "sem detalhe"}`;
  const e = new Error(msg);
  throw r.status === 429 || r.status >= 500 ? passageiro(e) : e;
}

export function custoTotal() {
  const usd = gastos.reduce((s, g) => s + g.usd, 0);
  return { usd, brl: usd * DOLAR, chamadas: gastos.length };
}

function anotar(modelo, etapa, entrada, saida) {
  const p = PRECO[modelo];
  if (!p) throw new Error(`sem preço cadastrado para ${modelo} — a conta ficaria errada`);
  const usd = (entrada * p.entrada + saida * p.saida) / 1_000_000;
  gastos.push({ modelo, etapa, entrada, saida, usd, brl: usd * DOLAR });
  return usd;
}

/**
 * Uma chamada de texto/visão que DEVE voltar JSON.
 *
 * `response_format: json_object` não é luxo: sem ele o modelo devolve o JSON
 * dentro de uma cerca de markdown metade das vezes, e o parse quebra no meio
 * de uma rodada de correção — justo quando a gente menos quer perder o
 * estado. Com ele, o que volta é JSON ou é erro.
 */
export async function perguntar({ modelo, etapa, sistema, usuario, imagens = [], teto = 2000 }) {
  const conteudo = [{ type: "text", text: usuario }];
  for (const img of imagens) {
    conteudo.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}`, detail: "high" },
    });
  }

  const j = await comRepeticao(etapa, async () => {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHAVE}` },
      body: JSON.stringify({
        model: modelo,
        max_tokens: teto,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: conteudo },
        ],
      }),
    }).catch((e) => {
      throw passageiro(new Error(`${etapa}: rede (${e.message})`));
    });
    const corpoJson = await corpo(r, etapa);
    conferir(r, corpoJson, etapa);
    return corpoJson;
  });

  anotar(modelo, etapa, j.usage.prompt_tokens, j.usage.completion_tokens);

  const texto = j.choices[0].message.content;
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`${etapa}: o modelo não devolveu JSON válido — ${texto.slice(0, 200)}`);
  }
}

/** Gera uma imagem do zero. Devolve o PNG cru. */
export async function gerarImagem({ etapa, prompt, tamanho = "1024x1536" }) {
  const j = await comRepeticao(etapa, async () => {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHAVE}` },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size: tamanho, n: 1 }),
    }).catch((e) => {
      throw passageiro(new Error(`${etapa}: rede (${e.message})`));
    });
    const corpoJson = await corpo(r, etapa);
    conferir(r, corpoJson, etapa);
    return corpoJson;
  });

  anotar("gpt-image-2", etapa, j.usage.input_tokens, j.usage.output_tokens);
  return Buffer.from(j.data[0].b64_json, "base64");
}

/**
 * Monta a CENA: entra a foto real do veículo, sai a mesma picape num cenário
 * publicitário.
 *
 * ── Por que a cena é editada e não montada ───────────────────────────────
 *
 * A primeira arquitetura era recortar o carro aqui e colar num fundo gerado.
 * Morreu na primeira foto real: no pátio os carros ficam encostados, o
 * recortador fundiu a Saveiro com o carro de trás, e nenhuma regra de
 * geometria separou os dois (erosão até raio 36 e eles continuavam uma mancha
 * só). Fora isso, colar recorte em fundo deixa o carro flutuando — sem sombra
 * e sem reflexo, que é o que denuncia montagem amadora.
 *
 * O modelo de imagem resolve os três de uma vez: ele sabe qual é o veículo do
 * anúncio, apaga o resto do pátio, e devolve chão com reflexo e luz coerente.
 *
 * ── O que isso custa, e precisa estar escrito ────────────────────────────
 *
 * O veículo é REDESENHADO, não colado. Nos testes voltou fiel (placa, rodas,
 * adesivo da caçamba, emblema), mas são pixels novos. Por isso a fidelidade é
 * uma das notas do avaliador, e ela compara com a foto original — não é
 * confiança, é conferência.
 *
 * E por isso nenhum dado entra aqui. Preço, ano, km e modelo são escritos
 * depois, pelo motor de composição, com o texto que veio do cadastro. Um
 * modelo de imagem que escreve "R$ 54.900" erra o dígito uma vez em dez, e
 * essa é a única vez que importa.
 */
export async function montarCena({ etapa, foto, prompt, tamanho = "1024x1024" }) {
  const j = await comRepeticao(etapa, async () => {
    // O FormData é remontado a cada tentativa: o corpo é um stream e, depois
    // de enviado uma vez, a repetição iria com ele já consumido.
    const fd = new FormData();
    fd.append("model", "gpt-image-2");
    fd.append("image", new Blob([foto], { type: "image/jpeg" }), "veiculo.jpg");
    fd.append("size", tamanho);
    fd.append("prompt", prompt);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${CHAVE}` },
      body: fd,
    }).catch((e) => {
      throw passageiro(new Error(`${etapa}: rede (${e.message})`));
    });
    const corpoJson = await corpo(r, etapa);
    conferir(r, corpoJson, etapa);
    return corpoJson;
  });

  anotar("gpt-image-2", etapa, j.usage.input_tokens, j.usage.output_tokens);
  return Buffer.from(j.data[0].b64_json, "base64");
}
