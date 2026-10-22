// ===== Anulaciones: entrenamientos y partidos que no se celebraron =====
// «Deselección entrenamientos»: modo del calendario semanal; tocar un
// entrenamiento o la cabecera de un día lo marca como anulado (rayas
// diagonales) y deja de contar en los avisos de registros.
// «Deselección partidos»: ventana para anular partidos sin registro.
// Se guarda en GitHub (Historial/anulaciones.json) para todos; cada cambio
// sale en el Historial de cambios con la opción de deshacerlo.
(function () {
  "use strict";
  const FILE = "Historial/anulaciones.json";
  const LS = "NVA_ANULACIONES";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function gh() { try { return typeof ghSettings !== "undefined" ? ghSettings : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function b64dec(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, "")))); }
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(f) { const d = new Date(f + "T12:00:00"); return DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function vacio() { return { entrenos: {}, dias: {}, partidos: {}, deshechos: [] }; }
  function norm(d) { d = Object.assign(vacio(), d || {}); ["entrenos", "dias", "partidos"].forEach(k => { if (typeof d[k] !== "object" || !d[k]) d[k] = {}; }); if (!Array.isArray(d.deshechos)) d.deshechos = []; return d; }

  let datos = norm(lsGet(LS, null));
  const pkey = (team, date, rival) => team + "|" + date + "|" + (rival || "");

  window.nvaEntrenoAnulado = (team, date) => !!(datos.entrenos[team + "|" + date] || datos.dias[date]);
  window.nvaDiaAnulado = date => !!datos.dias[date];
  window.nvaPartidoAnulado = (team, date, rival) => !!datos.partidos[pkey(team, date, rival)];
  window.nvaAccionDeshecha = id => datos.deshechos.indexOf(id) !== -1;

  function redibujar() { try { if (typeof renderWeekCalendar === "function") renderWeekCalendar(); } catch (e) {} }

  // ---------- GitHub ----------
  function url(g) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${FILE}`; }
  async function leer(g) {
    const r = await fetch(url(g), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", data: vacio() };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let data = vacio();
    try { data = norm(JSON.parse(b64dec(j.content))); } catch (e) {}
    return { sha: j.sha, data };
  }
  // Aplica un cambio sobre la versión más reciente de GitHub (o solo en local si no hay conexión)
  let cola = Promise.resolve();
  function cambiar(fn, mensaje) {
    fn(datos); lsSet(LS, datos); redibujar();
    cola = cola.then(async () => {
      const g = gh();
      if (!navigator.onLine || !g || !g.user || !g.token) return;
      for (let i = 0; i < 3; i++) {
        const { sha, data } = await leer(g);
        fn(data);
        const body = { message: mensaje, content: b64enc(JSON.stringify(data, null, 1)) };
        if (sha) body.sha = sha;
        const r = await fetch(url(g), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) { datos = data; lsSet(LS, datos); redibujar(); return; }
        if (r.status !== 409 && r.status !== 422) return;
      }
    }).catch(() => {});
    return cola;
  }
  async function cargar() {
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) return;
    try { datos = (await leer(g)).data; lsSet(LS, datos); redibujar(); } catch (e) {}
  }
  window.nvaRecargarAnulaciones = cargar;

  function quien() { return { t: new Date().toISOString(), disp: window.nvaDispositivo ? window.nvaDispositivo() : "" }; }
  function anotar(texto, deshacer) { if (window.nvaRegistrar) window.nvaRegistrar("anulacion", texto, { deshacer }); }
  function nombreEquipo(k) { return k; }

  // ---------- Entrenamientos (calendario semanal) ----------
  let modo = false;
  window.nvaModoAnular = () => modo;
  window.nvaToggleEntreno = function (team, date) {
    const k = team + "|" + date;
    if (datos.dias[date] && !datos.entrenos[k]) { alert("Todo el " + fmt(date) + " está anulado. Toca la cabecera del día para reactivarlo."); return; }
    const anular = !datos.entrenos[k];
    aplicar({ tipo: "entreno", team, date, anular });
    anotar((anular ? "🚫 Entrenamiento anulado: " : "↩ Entrenamiento reactivado: ") + nombreEquipo(team) + " · " + fmt(date), { tipo: "entreno", team, date, anular: !anular });
  };
  window.nvaToggleDia = function (date) {
    const anular = !datos.dias[date];
    aplicar({ tipo: "dia", date, anular });
    anotar((anular ? "🚫 Día anulado (todos los entrenamientos): " : "↩ Día reactivado: ") + fmt(date), { tipo: "dia", date, anular: !anular });
  };
  function aplicar(op) {
    const q = quien();
    const fn = d => {
      if (op.tipo === "entreno") { const k = op.team + "|" + op.date; if (op.anular) d.entrenos[k] = q; else delete d.entrenos[k]; }
      else if (op.tipo === "dia") { if (op.anular) d.dias[op.date] = q; else delete d.dias[op.date]; }
      else if (op.tipo === "partido") { const k = pkey(op.team, op.date, op.rival); if (op.anular) d.partidos[k] = Object.assign({ equipo: op.equipo || op.team }, q); else delete d.partidos[k]; }
    };
    return cambiar(fn, "Anulaciones de registros");
  }

  window.nvaDeselEntrenos = function () {
    modo = !modo;
    document.getElementById("anulBarra").hidden = !modo;
    const btn = document.getElementById("btnDeselEntrenos");
    if (btn) btn.classList.toggle("anul-on", modo);
    if (modo) {
      try { if (typeof applySectionState === "function") applySectionState("wk", true); } catch (e) {}
      const c = document.getElementById("secHead_wk") || document.getElementById("wkCanvas");
      if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ---------- Deshacer desde el Historial ----------
  window.nvaDeshacer = function (e) {
    const op = e && e.extra && e.extra.deshacer;
    if (!op || window.nvaAccionDeshecha(e.id)) return;
    if (!confirm("¿Deshacer este cambio?\n\n" + e.texto)) return;
    cambiar(d => { if (d.deshechos.indexOf(e.id) === -1) d.deshechos.push(e.id); }, "Deshacer anulación");
    aplicar(op);
    anotar("↩ Deshecho: " + e.texto, null);
  };

  // ---------- Partidos ----------
  let semana = 0;
  function lunes(off) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d; }
  function partidosSemana() {
    const l = lunes(semana), dom = new Date(l); dom.setDate(l.getDate() + 6);
    const a = ymd(l), b = ymd(dom);
    const cp = window.cpGetData ? window.cpGetData() : null;
    const out = [];
    Object.keys((cp && cp.teams) || {}).forEach(team => ((cp.teams[team] || {}).matches || []).forEach(m => {
      if (m.date >= a && m.date <= b && !/DESCANSA/i.test(m.rival || "")) out.push({ team, date: m.date, hora: m.time && m.time !== "00:00" ? m.time : "", rival: m.rival || "" });
    }));
    return out.sort((x, y) => (x.date + x.hora) < (y.date + y.hora) ? -1 : 1);
  }
  function registrado(p) {
    try { return (allMatchLogs || []).some(l => l.equipo === p.team && l.fecha === p.date && Array.isArray(l.jugadores) && l.jugadores.length); } catch (e) { return false; }
  }
  function pintarPartidos() {
    document.querySelectorAll(".anul-sem").forEach(b => b.classList.toggle("on", Number(b.dataset.s) === semana));
    const l = lunes(semana), dom = new Date(l); dom.setDate(l.getDate() + 6);
    document.getElementById("anulSemTxt").textContent = "Del " + l.getDate() + "/" + (l.getMonth() + 1) + " al " + dom.getDate() + "/" + (dom.getMonth() + 1);
    const lista = partidosSemana();
    const box = document.getElementById("anulPartidos");
    if (!lista.length) { box.innerHTML = '<p class="hist-vacio">No hay partidos en el calendario esta semana.</p>'; return; }
    box.innerHTML = lista.map((p, i) => {
      const reg = registrado(p), an = window.nvaPartidoAnulado(p.team, p.date, p.rival);
      return `<label class="anul-part${an ? " anul-si" : ""}${reg ? " anul-reg" : ""}"><input type="checkbox" data-i="${i}"${an ? " checked" : ""}${reg && !an ? " disabled" : ""}>
        <span><b>${esc(p.team)}</b><br>${esc(fmt(p.date))}${p.hora ? " " + esc(p.hora) : ""} · vs ${esc(p.rival)}${reg ? ' <em>✓ registrado</em>' : ""}${an ? ' <em class="anul-tag">ANULADO</em>' : ""}</span></label>`;
    }).join("");
    box.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const p = lista[Number(inp.dataset.i)], anular = inp.checked;
      aplicar({ tipo: "partido", team: p.team, date: p.date, rival: p.rival, anular });
      anotar((anular ? "🚫 Partido anulado: " : "↩ Partido reactivado: ") + p.team + " · " + fmt(p.date) + " vs " + p.rival, { tipo: "partido", team: p.team, date: p.date, rival: p.rival, anular: !anular });
      pintarPartidos();
    }));
  }
  window.openDeselPartidos = function () { semana = 0; document.getElementById("modalDeselPartidos").classList.add("active"); pintarPartidos(); };
  window.closeDeselPartidos = function () { document.getElementById("modalDeselPartidos").classList.remove("active"); };
  window.anulSemana = function (s) { semana = s; pintarPartidos(); };

  window.addEventListener("load", () => setTimeout(cargar, 800));
})();
