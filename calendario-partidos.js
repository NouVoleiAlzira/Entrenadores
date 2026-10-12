// =====================================================================
//  CALENDARIO DE PARTIDOS (sección plegable al final de la pantalla principal)
//  - Cada equipo puede subir el PDF de calendario de la federación.
//  - El PDF se lee en el propio dispositivo (pdf.js, el mismo que usa app.js),
//    se busca el equipo y se extraen sus partidos (fecha, hora, rival, campo).
//  - Se guarda en local y en GitHub (CalendarioPartidos.json) para todos.
//  Usa funciones de app.js: ensurePdfJs, normalizeTeamName, getTeamKey,
//  writeGitHubFile, b64_to_utf8, escapeHtml, mostrarCargando, ocultarCargando.
// =====================================================================
(function () {
  const CP_FILE = "CalendarioPartidos.json";
  const CP_LOCAL = "NVA_CALENDARIO_PARTIDOS";
  const CP_OPEN = "NVA_SEC_CAL_OPEN";
  let cp = loadLocal();

  function loadLocal() {
    try { const d = JSON.parse(localStorage.getItem(CP_LOCAL)); if (d && d.teams) return d; } catch (e) {}
    return { teams: {}, updated: "" };
  }
  function saveLocal() { try { localStorage.setItem(CP_LOCAL, JSON.stringify(cp)); } catch (e) { console.warn(e); } }
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s));
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDay = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // ---------- Sección plegable (empieza plegada) ----------
  function setOpen(open) {
    const head = document.getElementById("secHead_cal");
    const body = document.getElementById("secBody_cal");
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open);
    body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) render();
  }
  window.cpToggleSection = function () {
    const open = document.getElementById("secBody_cal").classList.contains("collapsed");
    try { localStorage.setItem(CP_OPEN, open ? "1" : "0"); } catch (e) {}
    setOpen(open);
  };
  window.cpSectionKey = function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); window.cpToggleSection(); }
  };
  window.cpToggleTeams = function () {
    const box = document.getElementById("cpTeams");
    const btn = document.getElementById("cpTeamsBtn");
    const open = box.style.display === "none";
    box.style.display = open ? "" : "none";
    btn.textContent = open ? "👥 Ocultar equipos ▴" : "👥 Equipos · subir PDF de partidos ▾";
    if (open) renderTeams();
  };

  // ---------- Pintado ----------
  function render() { renderMatches(); renderTeams(); }

  function renderMatches() {
    const list = document.getElementById("cpMatches");
    const from = document.getElementById("cpFrom").value;
    const to = document.getElementById("cpTo").value;
    if (!list) return;
    const rows = [];
    Object.keys(cp.teams).forEach(key => {
      (cp.teams[key].matches || []).forEach(m => {
        if ((!from || m.date >= from) && (!to || m.date <= to)) rows.push(Object.assign({ team: key }, m));
      });
    });
    rows.sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));
    if (!rows.length) {
      const any = Object.keys(cp.teams).length;
      list.innerHTML = `<div class="cp-empty">${any ? "No hay partidos en esas fechas." : "Aún no hay calendarios. Pulsa «Equipos» y sube el PDF de partidos de cada equipo."}</div>`;
      return;
    }
    let html = "", lastDay = "";
    rows.forEach(m => {
      if (m.date !== lastDay) {
        lastDay = m.date;
        const d = new Date(m.date + "T12:00:00");
        html += `<div class="cp-day">${DIAS[d.getDay()]} ${fmtDay(m.date)}</div>`;
      }
      const vs = m.home ? `<b>${esc(m.team)}</b> vs ${esc(m.rival || "?")}` : `${esc(m.rival || "?")} vs <b>${esc(m.team)}</b>`;
      html += `<div class="cp-match">
        <div class="cp-time">${esc(m.time || "--:--")}</div>
        <div class="cp-info">
          <div class="cp-vs">${vs}</div>
          <div class="cp-meta">${m.home === true ? "🏠 Local" : m.home === false ? "🚌 Visitante" : ""}${m.venue ? " · " + esc(m.venue) : ""}${m.jornada ? " · J" + esc(m.jornada) : ""}</div>
        </div></div>`;
    });
    list.innerHTML = html;
  }

  function renderTeams() {
    const box = document.getElementById("cpTeams");
    if (!box || box.style.display === "none") return;
    const teams = (typeof appData !== "undefined" && appData.teams) || [];
    if (!teams.length) { box.innerHTML = `<div class="cp-empty">No hay equipos configurados.</div>`; return; }
    box.innerHTML = teams.map((t, i) => {
      const key = getTeamKey(t);
      const info = cp.teams[key];
      const status = info
        ? `<span class="wk-mark wk-v">V</span><span class="cp-up">${fmtDay(info.uploadedAt.slice(0, 10))} · ${(info.matches || []).length} partidos</span>`
        : `<span class="cp-up cp-none">Sin PDF</span>`;
      return `<div class="cp-team">
        <div class="cp-team-name">${esc(key)}<div class="cp-team-status">${status}</div></div>
        <button class="cp-upload" onclick="cpPickPdf(${i})">📄 ${info ? "Cambiar" : "Subir"} PDF</button>
      </div>`;
    }).join("");
  }

  // ---------- Subida y análisis del PDF ----------
  let pickIdx = -1;
  window.cpPickPdf = function (i) {
    pickIdx = i;
    const inp = document.getElementById("cpFileInput");
    inp.value = "";
    inp.click();
  };

  async function pdfLines(file) {
    await ensurePdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5], x = it.transform[4];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push({ x, w: it.width || 0, str: it.str.trim() });
      });
      lines.sort((a, b) => b.y - a.y);
      lines.forEach(l => {
        l.items.sort((a, b) => a.x - b.x);
        // Celdas: textos separados por un hueco grande son columnas distintas
        const cells = [];
        let prevEnd = -1e9;
        l.items.forEach(it => {
          if (cells.length && it.x - prevEnd < 6) cells[cells.length - 1] += " " + it.str;
          else cells.push(it.str);
          prevEnd = it.x + it.w;
        });
        out.push({ text: l.items.map(i => i.str).join(" ").replace(/\s+/g, " "), cells: cells.map(c => c.replace(/\s+/g, " ").trim()) });
      });
    }
    return out;
  }

  const RE_DATE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
  const RE_TIME = /\b(\d{1,2})[:.h](\d{2})\b(?![\/\-.]\d)/;
  const RE_JOR = /JORNADA\s*(\d+)/i;

  function parseDate(s) {
    const m = s.match(RE_DATE);
    if (!m) return "";
    let y = parseInt(m[3], 10); if (y < 100) y += 2000;
    const mo = parseInt(m[2], 10), d = parseInt(m[1], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  function parseTime(s) {
    const clean = s.replace(new RegExp(RE_DATE.source, "g"), " ");
    const m = clean.match(RE_TIME);
    if (!m) return "";
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : "";
  }
  const isDataCell = (c) => !/[A-Za-zÀ-ÿ]{2,}/.test(c.replace(RE_DATE, "").replace(/\bh\b/i, ""));
  const tokens = (n) => normalizeTeamName(n).split(" ").filter(Boolean);

  // Cuántas palabras del nombre buscado aparecen en el texto (0..1)
  function score(name, text) {
    const t = " " + normalizeTeamName(text) + " ";
    const tk = tokens(name);
    if (!tk.length) return 0;
    if (t.includes(" " + tk.join(" ") + " ")) return 1;
    return tk.filter(w => t.includes(" " + w + " ")).length / tk.length;
  }

  // Posibles nombres de equipo en celdas de líneas con fecha (para elegir si no se encuentra)
  function candidateNames(lines) {
    const count = {};
    lines.forEach(l => {
      if (!RE_DATE.test(l.text) && !RE_TIME.test(l.text)) return;
      l.cells.forEach(c => {
        if (isDataCell(c) || c.length < 3 || RE_JOR.test(c)) return;
        c.split(/\s+-\s+/).forEach(part => {
          const k = part.trim(); if (k.length >= 3) count[k] = (count[k] || 0) + 1;
        });
      });
    });
    return Object.keys(count).filter(k => count[k] >= 2).sort((a, b) => count[b] - count[a]);
  }

  function findFedName(lines, team) {
    const names = candidateNames(lines);
    const wanted = [team.name, `${team.name} ${team.category}`];
    let best = null, bestScore = 0;
    names.forEach(n => {
      const s = Math.max(...wanted.map(w => score(w, n))) + (/\bNVA\b|ALZIRA/.test(normalizeTeamName(n)) ? 0.3 : 0);
      if (s > bestScore) { bestScore = s; best = n; }
    });
    return { best: bestScore >= 0.99 ? best : null, names };
  }

  function extractMatches(lines, fed) {
    const fedN = normalizeTeamName(fed);
    const matches = [];
    let curDate = "", curJor = "";
    lines.forEach((l, i) => {
      const jm = l.text.match(RE_JOR); if (jm) curJor = jm[1];
      const d = parseDate(l.text);
      if (d && !normalizeTeamName(l.text).includes(fedN)) curDate = d; // cabecera de jornada con fecha
      if (!normalizeTeamName(l.text).includes(fedN)) return;
      // Fecha/hora en la línea, o en la siguiente/anterior si el PDF las parte
      const near = [l, lines[i + 1], lines[i - 1]].filter(Boolean);
      let date = d, time = parseTime(l.text);
      if (!date) date = curDate;
      if (!time) { const n = near.slice(1).find(x => parseTime(x.text) && !/[A-Za-z]{3,}/.test(x.text.replace(RE_TIME, ""))); time = n ? parseTime(n.text) : ""; }
      if (!date) return;
      // Celdas de texto (equipos, campo): separar también "LOCAL - VISITANTE"
      let parts = [];
      l.cells.forEach(c => {
        if (isDataCell(c) || RE_JOR.test(c)) return;
        c.replace(RE_DATE, "").replace(RE_TIME, "").split(/\s+-\s+/).forEach(p => { p = p.trim(); if (/[A-Za-zÀ-ÿ]{2,}/.test(p)) parts.push(p); });
      });
      const own = parts.findIndex(p => normalizeTeamName(p).includes(fedN));
      let rival = "", home = null, venue = "";
      if (own >= 0) {
        const ownIsWholeCell = normalizeTeamName(parts[own]) === fedN;
        if (!ownIsWholeCell) { // "NVA A ALGEMESI" en una sola celda: el rival es el resto
          const rest = parts[own].replace(new RegExp(fed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/^\s*-\s*|\s*-\s*$/g, "").trim();
          if (rest) { rival = rest; home = normalizeTeamName(parts[own]).indexOf(fedN) === 0; }
        }
        if (!rival) {
          if (own > 0 && (own === parts.length - 1 || own % 2 === 1)) { rival = parts[own - 1]; home = false; venue = parts.slice(own + 1).join(" · "); }
          else if (parts[own + 1]) { rival = parts[own + 1]; home = true; venue = parts.slice(own + 2).join(" · "); }
        } else venue = parts.slice(own + 1).join(" · ");
      }
      matches.push({ date, time, rival, home, venue, jornada: curJor, raw: l.text });
    });
    // Sin duplicados (mismo día y rival)
    const seen = new Set();
    return matches.filter(m => { const k = m.date + m.time + m.rival; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  async function onFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    const team = ((typeof appData !== "undefined" && appData.teams) || [])[pickIdx];
    if (!file || !team) return;
    const key = getTeamKey(team);
    mostrarCargando("Analizando el PDF de partidos...");
    let lines;
    try { lines = await pdfLines(file); }
    catch (e) {
      console.error(e); ocultarCargando();
      alert("No se pudo leer el PDF. La primera vez hace falta conexión para descargar el lector de PDF.");
      return;
    }
    ocultarCargando();

    const prev = cp.teams[key];
    let fed = prev && prev.fedName && lines.some(l => normalizeTeamName(l.text).includes(normalizeTeamName(prev.fedName))) ? prev.fedName : null;
    if (!fed) {
      const r = findFedName(lines, team);
      fed = r.best;
      if (!fed) {
        if (!r.names.length) { alert("No he encontrado partidos con fecha en este PDF."); return; }
        const menu = r.names.slice(0, 40).map((n, i) => `${i + 1}. ${n}`).join("\n");
        const ans = prompt(`No encuentro "${key}" en el PDF.\nEscribe el número del equipo que corresponde:\n\n${menu}`);
        if (ans === null) return;
        const n = parseInt(ans, 10);
        if (!(n >= 1 && n <= Math.min(40, r.names.length))) return;
        fed = r.names[n - 1];
      }
    }
    const matches = extractMatches(lines, fed);
    if (!matches.length) { alert(`He encontrado "${fed}" pero ningún partido con fecha.`); return; }
    if (!confirm(`Equipo encontrado en el PDF: "${fed}"\n${matches.length} partidos (del ${fmtDay(matches[0].date)} al ${fmtDay(matches[matches.length - 1].date)}).\n\n¿Guardar para ${key}?`)) return;

    cp.teams[key] = { fedName: fed, fileName: file.name, uploadedAt: new Date().toISOString(), matches };
    cp.updated = new Date().toISOString();
    saveLocal();
    render();
    if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
      writeGitHubFile(CP_FILE, cp, `Calendario de partidos de ${key}`);
    }
  }

  async function fetchFromGitHub() {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    if (typeof offlineQueue !== "undefined" && offlineQueue.some(op => op.fileName === CP_FILE)) return;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    try {
      const res = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${CP_FILE}`, { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = JSON.parse(b64_to_utf8((await res.json()).content));
      if (data && data.teams) { cp = data; saveLocal(); render(); }
    } catch (e) { console.error(`Error al cargar ${CP_FILE}:`, e); }
  }

  function init() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (!from) return;
    const today = new Date(), later = new Date(); later.setDate(today.getDate() + 14);
    from.value = isoDay(today); to.value = isoDay(later);
    from.addEventListener("change", renderMatches);
    to.addEventListener("change", renderMatches);
    document.getElementById("cpFileInput").addEventListener("change", (e) => onFile(e.target));
    let open = false; try { open = localStorage.getItem(CP_OPEN) === "1"; } catch (e) {}
    setOpen(open);
    renderMatches();
    fetchFromGitHub();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
