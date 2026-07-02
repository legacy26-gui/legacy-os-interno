export function ThemeScript() {
  const script = `
    (function() {
      try {
        var stored = localStorage.getItem("legacyos-theme");
        var theme = stored || "dark";
        if (theme === "dark") document.documentElement.classList.add("dark");
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
