// Contraste, medido.
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// O diretor escolhe as cores, e escolheu bem na maioria das vezes. "Maioria"
// não serve: na rodada em que o Stories saiu com "SAVEIRO CROSS" cinza-escuro
// sobre fundo preto, a peça foi pro avaliador, tirou 7 em legibilidade e
// passou. Um texto que some não é questão de gosto, é defeito — e defeito que
// dá pra medir não devia depender de alguém reparar.
//
// A régua é a da WCAG: razão de contraste entre duas cores, de 1 (iguais) a
// 21 (preto e branco). 4,5 é o mínimo pra texto corrido, 3 pra texto grande.
// Quando a escolha do modelo não passa, a cor é trocada pela que passa — e a
// troca fica registrada, pra não virar correção invisível.

/** Luminância relativa, pela fórmula da WCAG. */
function luz(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores, de 1 a 21. */
export function contraste(a, b) {
  const [x, y] = [luz(a), luz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Preto ou branco, o que ler melhor sobre esta cor. */
export function letraSobre(fundo) {
  return contraste("#FFFFFF", fundo) >= contraste("#0B0B0C", fundo) ? "#FFFFFF" : "#0B0B0C";
}

/**
 * Devolve a cor pedida se ela passa no contraste; senão, a que passa.
 * `trocas` recebe uma linha explicando cada substituição.
 */
export function corLegivel(cor, fundo, minimo, nome, trocas) {
  if (contraste(cor, fundo) >= minimo) return cor;
  const salva = letraSobre(fundo);
  trocas.push(
    `${nome}: ${cor} sobre ${fundo} dava ${contraste(cor, fundo).toFixed(1)}:1 (mínimo ${minimo}) — trocado por ${salva}`
  );
  return salva;
}
