// ===== Mensaje de aviso: entrenamientos y partidos sin registrar =====
// Dirección elige días (esta semana o la anterior); se revisa, para cada
// entrenador, qué entrenamientos (según Horarios.json) y partidos (según el
// calendario) de sus equipos no tienen registro. Los avisos se guardan en
// GitHub (Historial/avisos.json) y salen al abrir la app en un dispositivo
// asignado a ese entrenador (Historial de cambios › ⚙️).
(function () {
  "use strict";
  const AV_FILE = "Historial/avisos.json";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  function gh() { try { return typeof ghSettings !== "undefined" ? ghSettings : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function b64dec(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, "")))); }
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(f) { const d = new Date(f + "T12:00:00"); return DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function sanit(n) { return typeof sanitizeFileName === "function" ? sanitizeFileName(n) : String(n || "general").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_"); }
  function coaches() { try { return (typeof appData !== "undefined" && appData.coaches) || []; } catch (e) { return []; } }
  function equiposDe(c) {
    try { if (typeof getCoachTeamEntries === "function") return getCoachTeamEntries(c); } catch (e) {}
    return (c.teams || []).map(t => ({ teamKey: t, name: t }));
  }
  // Entrenamientos y partidos anulados (anulaciones.js) no cuentan
  function anulE(team, date) { return !!(window.nvaEntrenoAnulado && window.nvaEntrenoAnulado(team, date)); }
  function anulP(team, date, rival) { return !!(window.nvaPartidoAnulado && window.nvaPartidoAnulado(team, date, rival)); }
  function url(g, path) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${path}`; }

  // Devuelve el fichero JSON (o null si no existe)
  async function leer(g, path) {
    const r = await fetch(url(g, path), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", data: null };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let data = null;
    if (j.content) { try { data = JSON.parse(b64dec(j.content)); } catch (e) {} }
    else if (j.download_url) { try { data = await (await fetch(j.download_url, { cache: "no-store" })).json(); } catch (e) {} }
    return { sha: j.sha, data };
  }

  // ¿Está registrado? Entrenamiento: existe el fichero. Partido: existe y tiene jugadores
  // (la carga automática de resultados crea ficheros de partido sin jugadores).
  async function registrado(g, it) {
    const path = it.tipo === "match" ? `Partidos/Partidos_${sanit(it.team)}_${it.date}.json` : `registros/Entrenamientos_${sanit(it.team)}_${it.date}.json`;
    const { data } = await leer(g, path);
    if (!data) return false;
    return it.tipo !== "match" || (Array.isArray(data.jugadores) && data.jugadores.length > 0);
  }
  async function enLotes(arr, fn, n) {
    const out = new Array(arr.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => { while (i < arr.length) { const k = i++; out[k] = await fn(arr[k]); } }));
    return out;
  }

  // ---------- Ventana de Dirección ----------
  let semana = 0;              // 0 = esta semana, -1 = la anterior
  let resultado = null;        // { coachId: { nombre, items: [] } }
  function lunes(off) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d; }

  function pintarDias() {
    const l = lunes(semana), hoy = ymd(new Date());
    document.querySelectorAll(".av-sem").forEach(b => b.classList.toggle("on", Number(b.dataset.s) === semana));
    document.getElementById("avDias").innerHTML = DIAS.map((n, i) => {
      const d = new Date(l); d.setDate(l.getDate() + i);
      const f = ymd(d), fut = f > hoy;
      return `<label class="av-dia${fut ? " av-fut" : ""}"><input type="checkbox" value="${f}"${fut ? " disabled" : " checked"}><span>${n}<small>${d.getDate()}/${d.getMonth() + 1}</small></span></label>`;
    }).join("");
    document.getElementById("avRes").innerHTML = "";
    document.getElementById("avEnviar").hidden = true;
    resultado = null;
  }

  window.openAvisos = function () {
    semana = 0;
    document.getElementById("modalAvisos").classList.add("active");
    document.getElementById("avEstado").textContent = "";
    pintarDias();
  };
  window.closeAvisos = function () { document.getElementById("modalAvisos").classList.remove("active"); };
  window.avSemana = function (s) { semana = s; pintarDias(); document.getElementById("avEstado").textContent = ""; };

  window.avRevisar = async function () {
    const est = document.getElementById("avEstado");
    const fechas = [...document.querySelectorAll("#avDias input:checked")].map(i => i.value);
    if (!fechas.length) { est.textContent = "Elige al menos un día."; return; }
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) { est.textContent = "Hace falta conexión con GitHub."; return; }
    est.textContent = "Revisando registros…";
    document.getElementById("avRes").innerHTML = "";
    try {
      const hz = ((await leer(g, "Horarios.json")).data || {}).trainings || {};
      let cp = window.cpGetData ? window.cpGetData() : null;
      if (!cp || !cp.teams || !Object.keys(cp.teams).length) cp = (await leer(g, "CalendarioPartidos.json")).data || {};
      const teams = cp.teams || {};
      // Lo que tocaba cada equipo esos días
      const porEquipo = {};
      const tareas = [];
      coaches().forEach(c => equiposDe(c).forEach(e => {
        if (porEquipo[e.teamKey]) return;
        const items = porEquipo[e.teamKey] = [];
        fechas.forEach(f => {
          const dow = (new Date(f + "T12:00:00").getDay() + 6) % 7 + 1;   // 1 = lunes
          const tr = (hz[e.teamKey] || []).filter(t => Number(t.day) === dow).sort((a, b) => a.start < b.start ? -1 : 1);
          if (tr.length && !anulE(e.teamKey, f)) items.push({ tipo: "train", team: e.teamKey, equipo: e.name, date: f, hora: tr[0].start });
          ((teams[e.teamKey] || {}).matches || []).filter(m => m.date === f && !/DESCANSA/i.test(m.rival || "") && !anulP(e.teamKey, f, m.rival || "")).forEach(m =>
            items.push({ tipo: "match", team: e.teamKey, equipo: e.name, date: f, hora: m.time && m.time !== "00:00" ? m.time : "", rival: m.rival || "" }));
        });
        tareas.push(...items);
      }));
      const ok = await enLotes(tareas, it => registrado(g, it).catch(() => true), 6);
      const falta = new Set(tareas.filter((t, i) => !ok[i]));
      resultado = {};
      coaches().forEach(c => {
        const items = [];
        equiposDe(c).forEach(e => (porEquipo[e.teamKey] || []).forEach(it => { if (falta.has(it)) items.push(it); }));
        items.sort((a, b) => (a.date + a.hora) < (b.date + b.hora) ? -1 : 1);
        resultado[c.id] = { nombre: c.name, items };
      });
      pintarResultado();
      est.textContent = "";
    } catch (e) { est.textContent = "No se pudo revisar: " + e.message; }
  };

  function lineaItem(it) {
    return (it.tipo === "match" ? "🏐 Partido" : "🏃 Entrenamiento") + " · " + it.equipo + " · " + fmt(it.date) + (it.hora ? " " + it.hora : "") + (it.rival ? " vs " + it.rival : "");
  }

  function pintarResultado() {
    const ids = Object.keys(resultado);
    const asignados = new Set(Object.values(window.nvaEntrenadoresAsignados ? window.nvaEntrenadoresAsignados() : {}).map(String));
    const con = ids.filter(id => resultado[id].items.length);
    let html = con.length ? "" : '<p class="hist-vacio">✅ Todos los entrenadores tienen registrado todo lo de esos días.</p>';
    con.forEach(id => {
      const r = resultado[id];
      html += `<div class="av-coach"><label class="av-coach-head"><input type="checkbox" data-id="${esc(id)}" checked> <b>${esc(r.nombre)}</b> · ${r.items.length} sin registrar${asignados.has(String(id)) ? "" : ' <span class="av-sin">(sin dispositivo asignado)</span>'}</label><ul>${r.items.map(it => `<li>${esc(lineaItem(it))}</li>`).join("")}</ul></div>`;
    });
    const ok = ids.filter(id => !resultado[id].items.length).map(id => resultado[id].nombre);
    if (con.length && ok.length) html += `<p class="av-ok">✅ Al día: ${esc(ok.join(", "))}</p>`;
    document.getElementById("avRes").innerHTML = html;
    document.getElementById("avEnviar").hidden = !con.length;
  }

  window.avEnviar = async function () {
    const est = document.getElementById("avEstado");
    const g = gh();
    const sel = [...document.querySelectorAll("#avRes input[data-id]:checked")].map(i => i.dataset.id);
    if (!sel.length) { est.textContent = "No hay ningún entrenador marcado."; return; }
    est.textContent = "Enviando avisos…";
    document.getElementById("avEnviar").disabled = true;
    try {
      for (let intento = 0; intento < 3; intento++) {
        const { sha, data } = await leer(g, AV_FILE);
        const av = (data && data.avisos) || {};
        const creado = new Date().toISOString();
        sel.forEach(id => { av[id] = { creado, nombre: resultado[id].nombre, items: resultado[id].items }; });
        const body = { message: "Avisos de registros pendientes", content: b64enc(JSON.stringify({ avisos: av }, null, 1)) };
        if (sha) body.sha = sha;
        const r = await fetch(url(g, AV_FILE), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) {
          const nombresSel = sel.map(id => resultado[id].nombre).join(", ");
          est.textContent = "";
          document.getElementById("avEnviar").hidden = true;
          document.getElementById("avRes").innerHTML = `<div style="margin-top:10px;padding:14px;border-radius:10px;background:#dcfce7;color:#14532d;border:1px solid #86efac;text-align:center;font-size:1em;">✅ <b>Aviso enviado</b><br>Para: ${esc(nombresSel)}.<br>Les saldrá al abrir la app en su dispositivo.</div>`;
          document.getElementById("avRes").scrollIntoView({ block: "nearest" });
          alert("✅ Aviso enviado a: " + nombresSel);
          return;
        }
        if (r.status !== 409 && r.status !== 422) break;
      }
      est.textContent = "";
      alert("❌ No se pudo enviar el aviso. Inténtalo de nuevo.");
    } catch (e) { est.textContent = ""; alert("❌ No se pudo enviar el aviso: " + e.message); }
    finally { document.getElementById("avEnviar").disabled = false; }
  };

  // ---------- Al abrir la app: aviso al entrenador de este dispositivo ----------
  async function comprobarAlAbrir() {
    try { if (sessionStorage.getItem("nvaAvisoVisto")) return; } catch (e) {}
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) return;
    try {
      if (window.nvaRecargarDispositivos) await window.nvaRecargarDispositivos();
      if (window.nvaRecargarAnulaciones) await window.nvaRecargarAnulaciones();
      const id = window.nvaEntrenadorDelDispositivo && window.nvaEntrenadorDelDispositivo();
      if (id == null || id === "") return;
      const { data } = await leer(g, AV_FILE);
      const av = data && data.avisos && data.avisos[id];
      if (!av || !(av.items || []).length) return;
      const ok = await enLotes(av.items, it => registrado(g, it).catch(() => false), 6);
      const pend = av.items.filter((it, i) => !ok[i] && !(it.tipo === "match" ? anulP(it.team, it.date, it.rival || "") : anulE(it.team, it.date)));
      if (!pend.length) return;
      const c = coaches().find(x => String(x.id) === String(id));
      document.getElementById("avAvisoTxt").innerHTML =
        `<p><b>${esc((c && c.name) || av.nombre || "")}</b>, no constan registrados:</p><ul>${pend.map(it => `<li>${esc(lineaItem(it))}</li>`).join("")}</ul><p>Por favor, regístralos lo antes posible. ¡Gracias!</p>`;
      document.getElementById("modalAvisoEntrenador").classList.add("active");
      try { sessionStorage.setItem("nvaAvisoVisto", "1"); } catch (e) {}
    } catch (e) {}
  }
  window.closeAvisoEntrenador = function () { document.getElementById("modalAvisoEntrenador").classList.remove("active"); };
  window.addEventListener("load", () => setTimeout(comprobarAlAbrir, 2500));
})();
