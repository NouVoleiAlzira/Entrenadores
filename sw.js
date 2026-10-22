// Service Worker - Nou Volei Alzira
// Sube el número de versión cada vez que quieras forzar una renovación completa de la caché.
const VERSION = "nva-v110";

const SHELL_CACHE = VERSION + "-shell";
const CDN_CACHE = VERSION + "-cdn";

// Archivos de la app que se guardan al instalar (rutas relativas: funciona en /Entrenadores/)
const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "animaciones.css",
  "animaciones.js",
  "inicio.css",
  "inicio.js",
  "instagram.js",
  "historia-cartel.js",
  "historia-editor.js",
  "app.js",
  "registro.js",
  "avisos.js",
  "anulaciones.js",
  "calendario-partidos.js",
  "importar-datos.js",
  "carteles-auto.js",
  "cuadrante-pdf.js",
  "kilometraje.js",
  "manifest.json",
  "LOGO-NVA.png",
  "Partidos.html",
  "Resultados.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "fonts/barlow-latin-400-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2",
  "fonts/barlow-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-800-italic.woff2"
];

// Librerías externas que app.js carga bajo demanda (PDF y gráficos)
const CDN_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Se añaden uno a uno: si falta algún archivo (p.ej. Resultados.html) no se rompe la instalación
      Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("nva-") && ![SHELL_CACHE, CDN_CACHE].includes(k))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Red primero (con límite de tiempo) y, si falla, caché. Así siempre ves la última versión si hay red.
function networkFirst(request, cacheName, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: true });
    const timer = setTimeout(async () => {
      const cached = await fromCache();
      if (cached && !settled) { settled = true; resolve(cached); }
    }, timeoutMs);

    fetch(request).then(async (res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(cacheName).then((c) => c.put(request, copy));
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(async () => {
      clearTimeout(timer);
      const cached = await fromCache();
      if (!settled) {
        settled = true;
        resolve(cached || new Response("Sin conexión", { status: 503, statusText: "Offline" }));
      }
    });
  });
}

// Caché primero para librerías externas (no cambian: versión fija)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  // Una copia "opaca" (sin CORS) no sirve para scripts con integrity: se ignora.
  if (cached && !(cached.type === "opaque" && request.mode === "cors")) return cached;
  const res = await fetch(request);
  // Solo se guardan respuestas correctas y verificables (nada de opacas).
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // La API de GitHub NUNCA se toca: datos siempre en directo (app.js ya gestiona su cola offline)
  if (url.hostname === "api.github.com") return;

  // Librerías CDN
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // Archivos propios de la app
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL_CACHE, 4000));
  }
});
