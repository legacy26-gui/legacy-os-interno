import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Legacy OS — Legacy Digital",
    short_name: "Legacy OS",
    description: "Sistema interno da Legacy Digital",
    // Abre direto no Meu Dia: é a tela que a equipe usa no celular.
    start_url: "/meu-dia",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111114",
    theme_color: "#111114",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Meu Dia", url: "/meu-dia" },
      { name: "Checklist de hoje", url: "/gestao-contas/hoje" },
      { name: "Financeiro", url: "/financeiro" },
    ],
  };
}
