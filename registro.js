// ===== Historial de cambios (registro cronológico de acciones) =====
// Anota cada acción de la app (botones pulsados y guardados en GitHub) con
// día, hora, descripción y quién la hizo. Se guarda primero en el dispositivo
// y se envía a GitHub en Historial/historial_<AAAA-MM>.json para que se vea
// lo de todos los entrenadores y dispositivos.
(function () {
  "use strict";
  const PEND_KEY = "NVA_HISTORIAL_PEND";
  const CACHE_KEY = "NVA_HISTORIAL_CACHE";
  const DEV_KEY = "NVA_DEVICE_ID";
  const FOLDER = "Historial";
  const MAX_CACHE = 800;
  const origFetch = window.fetch.bind(window);

  function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  let deviceId = "";
  try { deviceId = localStorage.getItem(DEV_KEY) || ""; } catch (e) {}
  if (!deviceId) { deviceId = "D" + Math.random().toString(36).slice(2, 7).toUpperCase(); try { localStorage.setItem(DEV_KEY, deviceId); } catch (e) {} }

  function gh() { try { return typeof ghSettings !== "undefined" ? ghSettings : null; } catch (e) { return null; } }

  function quien() {
    try {
      if (typeof currentCoach !== "undefined" && currentCoach && currentCoach.name) return currentCoach.name;
      if (typeof activeCoachId !== "undefined" && activeCoachId != null && typeof appData !== "undefined") {
        const c = (appData.coaches || []).find(x => String(x.id) === String(activeCoachId));
        if (c && c.name) return c.name;
      }
    } catch (e) {}
    return "";
  }

  function pantalla() {
    const a = document.querySelector(".screen.active");
    if (!a || a.id === "screenCoachTeam") return "";
    const s = a.querySelector(".section-title");
    return s ? s.textContent.replace(/[▾➤]/g, "").trim() : "";
  }

  function registrar(tipo, texto) {
    texto = String(texto || "").replace(/\s+/g, " ").trim();
    if (!texto) return;
    const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), tipo, texto: texto.slice(0, 200), quien: quien(), disp: deviceId, pant: pantalla() };
    const pend = lsGet(PEND_KEY, []); pend.push(e); lsSet(PEND_KEY, pend);
    programarEnvio();
  }
  window.nvaRegistrar = registrar;

  // --- Guardados en GitHub: se capturan todas las escrituras de la app ---
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if ((method === "PUT" || method === "DELETE") && url.indexOf("api.github.com/repos/") !== -1 && url.indexOf("/contents/" + FOLDER + "/") === -1) {
        let msg = "";
        try { msg = JSON.parse(init.body).message || ""; } catch (e) {}
        const ruta = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
        const p = origFetch(input, init);
        p.then(r => { if (r.ok) registrar("guardado", (method === "DELETE" ? "🗑 Borrado: " : "💾 ") + (msg || ruta)); }).catch(() => {});
        return p;
      }
    } catch (e) {}
    return origFetch(input, init);
  };

  // --- Acciones: cualquier botón pulsado ---
  let ultimo = { k: "", t: 0 };
  document.addEventListener("click", function (ev) {
    const el = ev.target.closest && ev.target.closest("button, [role=button], .coach-btn, a[href]");
    if (!el || el.closest("#modalHistorial")) return;
    let txt = (el.getAttribute("aria-label") || el.textContent || el.title || "").replace(/[▾➤]/g, "").trim();
    if (!txt) return;
    if (txt.length > 80) txt = txt.slice(0, 80) + "…";
    const now = Date.now();
    if (ultimo.k === txt && now - ultimo.t < 800) return;
    ultimo = { k: txt, t: now };
    const p = pantalla();
    registrar("accion", "Pulsó «" + txt + "»" + (p ? " en " + p : ""));
  }, true);

  // --- Envío a GitHub ---
  let timer = null, enviando = false;
  function programarEnvio(ms) { clearTimeout(timer); timer = setTimeout(enviar, ms || 15000); }
  function b64dec(s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, "")))); }
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function urlMes(g, mes) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${FOLDER}/historial_${mes}.json`; }

  async function leerMes(g, mes) {
    const r = await origFetch(urlMes(g, mes), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", items: [] };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let items = [];
    try { items = JSON.parse(b64dec(j.content)).items || []; } catch (e) {}
    return { sha: j.sha, items };
  }

  async function enviar() {
    const g = gh();
    const pend = lsGet(PEND_KEY, []);
    if (enviando || !pend.length || !navigator.onLine || !g || !g.user || !g.repo || !g.token) return;
    enviando = true;
    try {
      const porMes = {};
      pend.forEach(e => { (porMes[e.t.slice(0, 7)] = porMes[e.t.slice(0, 7)] || []).push(e); });
      const enviados = new Set();
      for (const mes of Object.keys(porMes)) {
        for (let intento = 0; intento < 3; intento++) {
          const { sha, items } = await leerMes(g, mes);
          const ids = new Set(items.map(x => x.id));
          porMes[mes].forEach(e => { if (!ids.has(e.id)) items.push(e); });
          items.sort((a, b) => a.t < b.t ? -1 : 1);
          const body = { message: `Historial ${mes} (${porMes[mes].length} acciones)`, content: b64enc(JSON.stringify({ items }, null, 1)) };
          if (sha) body.sha = sha;
          const r = await origFetch(urlMes(g, mes), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (r.ok) { porMes[mes].forEach(e => enviados.add(e.id)); guardarCache(items); break; }
          if (r.status !== 409 && r.status !== 422) break;
        }
      }
      lsSet(PEND_KEY, lsGet(PEND_KEY, []).filter(e => !enviados.has(e.id)));
    } catch (e) {
    } finally {
      enviando = false;
      if (lsGet(PEND_KEY, []).length) programarEnvio(60000);
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") enviar(); });
  window.addEventListener("online", () => programarEnvio(2000));

  function guardarCache(items) {
    const m = new Map(lsGet(CACHE_KEY, []).map(x => [x.id, x]));
    items.forEach(x => m.set(x.id, x));
    const all = [...m.values()].sort((a, b) => a.t < b.t ? 1 : -1).slice(0, MAX_CACHE);
    lsSet(CACHE_KEY, all);
    return all;
  }

  // --- Pantalla del historial ---
  let filtro = "todo";
  function esc(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function pintar(lista, estado) {
    const box = document.getElementById("histList");
    if (!box) return;
    document.getElementById("histEstado").textContent = estado || "";
    const q = (document.getElementById("histBuscar").value || "").toLowerCase();
    const items = lista.filter(e => (filtro === "todo" || e.tipo === filtro) && (!q || (e.texto + " " + e.quien).toLowerCase().includes(q)));
    if (!items.length) { box.innerHTML = '<p class="hist-vacio">No hay acciones registradas.</p>'; return; }
    let html = "", dia = "";
    items.forEach(e => {
      const d = new Date(e.t);
      const k = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      if (k !== dia) { dia = k; html += `<div class="hist-dia">${esc(k.charAt(0).toUpperCase() + k.slice(1))}</div>`; }
      const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      html += `<div class="hist-item hist-${e.tipo}"><div class="hist-hora">${hora}</div><div class="hist-txt">${esc(e.texto)}<div class="hist-quien">${esc(e.quien || "Sin entrenador seleccionado")} · ${esc(e.disp)}${e.pend ? " · ⏳ pendiente de enviar" : ""}</div></div></div>`;
    });
    box.innerHTML = html;
  }

  let ultimaLista = [];
  window.openHistorial = async function () {
    document.getElementById("modalHistorial").classList.add("active");
    const pendientes = () => lsGet(PEND_KEY, []).map(e => Object.assign({}, e, { pend: true }));
    const mezclar = base => { const m = new Map(base.map(x => [x.id, x])); pendientes().forEach(x => m.set(x.id, x)); return [...m.values()].sort((a, b) => a.t < b.t ? 1 : -1); };
    ultimaLista = mezclar(lsGet(CACHE_KEY, []));
    pintar(ultimaLista, "Cargando desde GitHub…");
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) { pintar(ultimaLista, "Sin conexión: se muestra lo guardado en este dispositivo."); return; }
    try {
      await enviar();
      const now = new Date();
      const meses = [0, 1].map(i => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); });
      let todos = [];
      for (const m of meses) todos = todos.concat((await leerMes(g, m)).items);
      ultimaLista = mezclar(guardarCache(todos));
      pintar(ultimaLista, "");
    } catch (e) { pintar(ultimaLista, "No se pudo leer GitHub: se muestra lo guardado en este dispositivo."); }
  };
  window.closeHistorial = function () { document.getElementById("modalHistorial").classList.remove("active"); };
  window.histFiltro = function (f, btn) {
    filtro = f;
    document.querySelectorAll(".hist-chip").forEach(b => b.classList.toggle("on", b === btn));
    pintar(ultimaLista, document.getElementById("histEstado").textContent);
  };
  window.histBuscar = function () { pintar(ultimaLista, document.getElementById("histEstado").textContent); };

  registrar("accion", "Abrió la app");
  programarEnvio(5000);
})();
