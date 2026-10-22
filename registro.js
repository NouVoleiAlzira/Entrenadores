// ===== Historial de cambios (registro cronológico de acciones) =====
// Anota cada cambio que crea, modifica o borra registros (guardados en GitHub) con
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

  function registrar(tipo, texto, extra) {
    texto = String(texto || "").replace(/\s+/g, " ").trim();
    if (!texto) return;
    const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), tipo, texto: texto.slice(0, 200), quien: quien(), disp: deviceId, pant: pantalla() };
    if (extra) e.extra = extra;
    const pend = lsGet(PEND_KEY, []); pend.push(e); lsSet(PEND_KEY, pend);
    programarEnvio(tipo === "anulacion" ? 3000 : undefined);
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
        p.then(r => { if (r.ok) registrar("guardado", (method === "DELETE" ? "🗑 Borrado: " : "") + (msg || ruta)); }).catch(() => {});
        return p;
      }
    } catch (e) {}
    return origFetch(input, init);
  };

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
  const filtro = "guardado"; // solo cambios en registros (las acciones antiguas de clics se ocultan)
  function esc(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // Botón «Deshacer» en los cambios de anulación (anulaciones.js)
  let porId = {};
  function deshacerHtml(e) {
    if (!e.extra || !e.extra.deshacer) return "";
    porId[e.id] = e;
    if (window.nvaAccionDeshecha && window.nvaAccionDeshecha(e.id)) return '<div class="hist-deshecho">↩ Deshecho</div>';
    return `<button class="hist-deshacer" onclick="histDeshacer('${e.id}')">↩ Deshacer</button>`;
  }
  window.histDeshacer = async function (id) {
    if (!window.nvaDeshacer || !porId[id]) return;
    window.nvaDeshacer(porId[id]);
    setTimeout(() => pintar(ultimaLista.concat(lsGet(PEND_KEY, []).map(x => Object.assign({}, x, { pend: true }))).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).sort((a, b) => a.t < b.t ? 1 : -1), ""), 300);
  };

  function pintar(lista, estado) {
    const box = document.getElementById("histList");
    if (!box) return;
    document.getElementById("histEstado").textContent = estado || "";
    const q = (document.getElementById("histBuscar").value || "").toLowerCase();
    const items = lista.filter(e => (e.tipo === filtro || e.tipo === "anulacion") && (!q || (e.texto + " " + nombreDisp(e.disp)).toLowerCase().includes(q)));
    if (!items.length) { box.innerHTML = '<p class="hist-vacio">No hay cambios registrados.</p>'; return; }
    let html = "", dia = "";
    items.forEach(e => {
      const d = new Date(e.t);
      const k = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      if (k !== dia) { dia = k; html += `<div class="hist-dia">${esc(k.charAt(0).toUpperCase() + k.slice(1))}</div>`; }
      const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      html += `<div class="hist-item hist-${e.tipo}"><div class="hist-hora">${hora}</div><div class="hist-txt">${esc(e.texto)}<div class="hist-quien">${esc(nombreDisp(e.disp))}${e.pend ? " · ⏳ pendiente de enviar" : ""}</div>${deshacerHtml(e)}</div></div>`;
    });
    box.innerHTML = html;
  }

  // --- Nombres de dispositivos (Historial/dispositivos.json, compartido) ---
  const NOM_KEY = "NVA_DISP_NOMBRES";
  const ENT_KEY = "NVA_DISP_ENTRENADORES";
  let nombres = lsGet(NOM_KEY, {});
  let entrenDisp = lsGet(ENT_KEY, {});   // código de dispositivo -> id del entrenador
  function nombreDisp(c) { return nombres[c] || c || ""; }
  // dispositivos.json: { <código>: <nombre>, ..., "__entrenadores": { <código>: <id entrenador> } }
  function cargarDisp(data) {
    data = Object.assign({}, data || {});
    entrenDisp = data.__entrenadores || {};
    delete data.__entrenadores;
    nombres = data;
    lsSet(NOM_KEY, nombres); lsSet(ENT_KEY, entrenDisp);
  }
  function coachesLista() { try { return (typeof appData !== "undefined" && appData.coaches) || []; } catch (e) { return []; } }
  window.nvaDispositivo = () => deviceId;
  window.nvaEntrenadorDelDispositivo = () => entrenDisp[deviceId];
  window.nvaEntrenadoresAsignados = () => entrenDisp;
  window.nvaRecargarDispositivos = async () => { const g = gh(); if (g && g.user && g.token) cargarDisp((await leerNombres(g)).data); };
  function urlNombres(g) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${FOLDER}/dispositivos.json`; }
  async function leerNombres(g) {
    const r = await origFetch(urlNombres(g), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", data: {} };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let data = {};
    try { data = JSON.parse(b64dec(j.content)) || {}; } catch (e) {}
    return { sha: j.sha, data };
  }

  window.histConfig = function (abrir) {
    document.getElementById("histConfig").hidden = !abrir;
    document.getElementById("histPrincipal").hidden = abrir;
    if (!abrir) return;
    const cods = [...new Set(ultimaLista.map(e => e.disp).filter(Boolean).concat(Object.keys(nombres), Object.keys(entrenDisp), [deviceId]))].sort();
    const coaches = coachesLista();
    document.getElementById("histDispList").innerHTML = '<div class="hist-disp-cab"><span>Código</span><span>Nombre</span><span>Entrenador</span></div>' + cods.map(c =>
      `<label class="hist-disp"><span class="hist-disp-cod">${esc(c)}${c === deviceId ? " (este)" : ""}</span><input class="app-input" data-cod="${esc(c)}" value="${esc(nombres[c] || "")}" placeholder="Nombre del dispositivo"><select class="app-input hist-disp-ent" data-cod="${esc(c)}"><option value="">— Entrenador —</option>${coaches.map(x => `<option value="${esc(x.id)}"${String(entrenDisp[c]) === String(x.id) ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`).join("");
    document.getElementById("histConfEstado").textContent = "";
  };
  window.histGuardarNombres = async function () {
    const est = document.getElementById("histConfEstado");
    const nuevos = {};
    const ents = {};
    document.querySelectorAll("#histDispList input").forEach(i => { const v = i.value.trim(); if (v) nuevos[i.dataset.cod] = v; });
    document.querySelectorAll("#histDispList select").forEach(i => { if (i.value) ents[i.dataset.cod] = i.value; });
    const g = gh();
    est.textContent = "Guardando…";
    try {
      if (!navigator.onLine || !g || !g.user || !g.token) throw new Error("offline");
      for (let intento = 0; intento < 3; intento++) {
        const { sha, data } = await leerNombres(g);
        const entPrev = data.__entrenadores || {};
        document.querySelectorAll("#histDispList input").forEach(i => { delete data[i.dataset.cod]; delete entPrev[i.dataset.cod]; });
        Object.assign(data, nuevos);
        data.__entrenadores = Object.assign(entPrev, ents);
        const body = { message: "Nombres de dispositivos del historial", content: b64enc(JSON.stringify(data, null, 1)) };
        if (sha) body.sha = sha;
        const r = await origFetch(urlNombres(g), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) { cargarDisp(data); histConfig(false); pintar(ultimaLista, ""); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      est.textContent = "No se pudo guardar en GitHub. Inténtalo de nuevo.";
    } catch (e) { est.textContent = "Sin conexión: no se pudo guardar en GitHub."; }
  };

  let ultimaLista = [];
  window.openHistorial = async function () {
    document.getElementById("modalHistorial").classList.add("active");
    histConfig(false);
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
      try { cargarDisp((await leerNombres(g)).data); } catch (e) {}
      try { if (window.nvaRecargarAnulaciones) await window.nvaRecargarAnulaciones(); } catch (e) {}
      ultimaLista = mezclar(guardarCache(todos));
      pintar(ultimaLista, "");
    } catch (e) { pintar(ultimaLista, "No se pudo leer GitHub: se muestra lo guardado en este dispositivo."); }
  };
  window.closeHistorial = function () { document.getElementById("modalHistorial").classList.remove("active"); };
  window.histBuscar = function () { pintar(ultimaLista, document.getElementById("histEstado").textContent); };

  // --- Apartado oculto: se muestra/oculta en este dispositivo tocando
  // 5 veces seguidas el logo de la cabecera en menos de 2 segundos ---
  const VIS_KEY = "NVA_HIST_VISIBLE";
  function aplicarVisible() {
    const sec = document.getElementById("histSeccion");
    if (sec) sec.hidden = (function () { try { return localStorage.getItem(VIS_KEY) !== "1"; } catch (e) { return true; } })();
  }
  let toques = [];
  document.addEventListener("click", e => {
    const hd = e.target.closest && e.target.closest("header");
    if (!hd || e.target.closest("button, a, input")) return;
    const r = hd.getBoundingClientRect();   // el escudo está centrado en la cabecera (230px)
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) > 120) return;
    const now = Date.now();
    toques = toques.filter(t => now - t < 2000);
    toques.push(now);
    if (toques.length < 5) return;
    toques = [];
    try { localStorage.setItem(VIS_KEY, localStorage.getItem(VIS_KEY) === "1" ? "0" : "1"); } catch (e) {}
    aplicarVisible();
    if (navigator.vibrate) navigator.vibrate(80);
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplicarVisible); else aplicarVisible();

  programarEnvio(5000);
})();
