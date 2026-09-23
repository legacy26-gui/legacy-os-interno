// Service worker do Legacy OS.
//
// Deliberadamente conservador: este é um sistema de gestão com login, onde
// dado velho é pior que dado ausente. Por isso NUNCA guardamos em cache
// páginas, respostas de API ou qualquer coisa que dependa de sessão — só
// arquivos estáticos com hash no nome (que nunca mudam de conteúdo) e a
// página de aviso de offline.

const VERSION = "v2";
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

// ── Aviso no celular ────────────────────────────────────────────────────────
// Chega mesmo com o app fechado: quem entrega é o sistema operacional. Serve
// pra lead novo da landing, que não pode esperar alguém abrir o sistema.

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { titulo: "Legacy OS", corpo: event.data ? event.data.text() : "" };
  }

  const titulo = dados.titulo || "Legacy OS";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Vibra pra chamar atenção mesmo com o celular no bolso.
      vibrate: [180, 80, 180],
      // Aviso do mesmo assunto substitui o anterior em vez de empilhar.
      tag: dados.tag || "legacyos",
      renotify: true,
      data: { url: dados.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // App já aberto: leva a aba existente pro lugar certo em vez de abrir
      // outra por cima.
      for (const janela of janelas) {
        if ("focus" in janela) {
          await janela.focus();
          if ("navigate" in janela) await janela.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })()
  );
});
