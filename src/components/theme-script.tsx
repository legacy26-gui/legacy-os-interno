/**
 * O que precisa estar decidido ANTES da primeira pintura da tela.
 *
 * São duas escolhas que moram no navegador de cada pessoa — o tema e a
 * largura do menu — e as duas mudam o desenho da página inteira. Se o React
 * as aplicasse depois, no primeiro efeito, a pessoa veria a tela clara piscar
 * antes de escurecer e o menu abrir antes de recolher. Pior: o HTML do
 * servidor diria uma coisa e o do navegador diria outra, que é exatamente o
 * erro de hidratação que já apareceu aqui uma vez.
 *
 * Por isso elas viram atributo no <html>, por um script que roda antes de
 * tudo, e quem desenha a partir disso é o CSS (ver globals.css). O React não
 * participa — e é justamente por não participar que não há divergência.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var tema = localStorage.getItem("legacyos-theme") || "dark";
        if (tema === "dark") document.documentElement.classList.add("dark");
      } catch (e) {}
      try {
        if (localStorage.getItem("legacyos-menu") === "recolhido") {
          document.documentElement.setAttribute("data-menu", "recolhido");
        }
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
