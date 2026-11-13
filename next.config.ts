import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A hora em que ESTE pacote foi construído.
  //
  // Precisa estar aqui, e não dentro da rota: o que está em `env` é embutido
  // no código na hora do build e congela. `new Date()` dentro da rota roda a
  // cada pedido e devolve a hora de AGORA — que foi exatamente o que o
  // /api/version vinha fazendo, dizendo "implantado agora mesmo" sempre, não
  // importa de quando fosse a versão. Passei três horas lendo esse número
  // como se fosse a hora do deploy e tirei três conclusões erradas dele.
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        // O service worker não pode ficar em cache, senão uma versão antiga
        // dele continua no ar mesmo depois de um deploy novo.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
