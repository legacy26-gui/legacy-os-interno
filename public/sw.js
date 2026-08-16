// Service worker do Legacy OS.
//
// Deliberadamente conservador: este é um sistema de gestão com login, onde
// dado velho é pior que dado ausente. Por isso NUNCA guardamos em cache
// páginas, respostas de API ou qualquer coisa que dependa de sessão — só
// arquivos estáticos com hash no nome (que nunca mudam de conteúdo) e a
// página de aviso de offline.

const VERSION = "v1";
const STATIC_CACHE = `legacyos-static-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Se um item falhar (ex: deploy no meio), não derruba a instalação toda.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só GET entra em qualquer estratégia de cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação (abrir uma tela): sempre rede. Sem internet, mostra o aviso.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })()
    );
    return;
  }

  // Estáticos com hash no nome: cache primeiro (o nome muda a cada build,
  // então nunca serve conteúdo desatualizado).
  const isImmutable = url.pathname.startsWith("/_next/static/");
  const isIcon = /\.(png|ico|svg|webmanifest)$/.test(url.pathname);

  if (isImmutable || isIcon) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })()
    );
  }

  // Todo o resto (RSC, API, dados) passa direto pela rede, sem cache.
});
