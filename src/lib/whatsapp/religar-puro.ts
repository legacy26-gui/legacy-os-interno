// Puro (testável): a frase pede pra ligar de volta?
import { achatar } from "./campanha-do-zero-puro";

const VERBO = /\b(re)?ativ(a|ar|e|em)\b|\breliga(r)?\b|\bliga(r)?\s+(de\s+volta|o|a|os|as)\b|\bvolta(r)?\s+(com|a\s+rodar|pro\s+ar|o|a)\b|\bcoloca(r)?\s+(de\s+volta|no\s+ar)\b/;

export function pedeParaReligar(texto: string): boolean {
  const t = achatar(texto);
  if (/\bdesativ|\bdeslig|\bpausa|\btira\b/.test(t)) return false;
  if (/\?\s*$/.test(texto.trim())) return false;
  return VERBO.test(t);
}

export function semVerboDeReligar(texto: string): string {
  return achatar(texto)
    .replace(/\b(re)?ativ(a|ar|e|em)\b|\breliga(r)?\b|\bliga(r)?\b|\bvolta(r)?\b|\bcoloca(r)?\b|\bde volta\b|\bno ar\b|\bpro ar\b|\ba rodar\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
