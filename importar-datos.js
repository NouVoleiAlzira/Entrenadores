/* =====================================================================
   Importar datos en Opciones
   - Jugadores/as y Equipos: cargar un Excel (Nombre, Apellidos, Equipos)
   - Ligas: cargar las ligas de todos los equipos desde los PDF de la
     federación guardados en GitHub (carpeta Calendarios)
   En los dos casos se muestran las diferencias y se pregunta antes de guardar.
   ===================================================================== */
(function () {
  "use strict";

  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw";
  const CAL_FOLDER = "Calendarios";
  const CATEGORIES = ["Escuela", "Alevín", "Infantil", "Cadete", "Juvenil", "Junior", "Senior Femenino", "Senior Masculino", "Mixto"];

  const esc = (v) => escapeHtml(v);
  const norm = (s) => normalizeTeamName(s);

  let xlsxPromise = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxPromise) xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous"; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { xlsxPromise = null; reject(new Error("No se pudo cargar el lector de Excel")); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  // ---------- Ventana de diferencias (casillas para elegir qué se aplica) ----------
  // groups: [{ title, extra?, items: [{ id, label, checked, cls }] }]
  function askDiffs(title, intro, groups, okText) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${esc(title)}</div>
        <div class="cp-modal-txt">${intro}</div>
        <div class="imp-list">${groups.map((g, gi) => `
          <div class="imp-group">
            <div class="imp-group-title">${esc(g.title)}${g.extra || ""}</div>
            ${g.items.map(it => `<label class="imp-item ${it.cls || ""}"><input type="checkbox" data-id="${esc(it.id)}" ${it.checked ? "checked" : ""}> <span>${it.label}</span></label>`).join("")}
          </div>`).join("")}
        </div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">${esc(okText)}</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const sel = new Set(Array.from(o.querySelectorAll(".imp-list input[type=checkbox]:checked")).map(c => c.dataset.id));
        const extras = {};
        o.querySelectorAll(".imp-list select[data-id]").forEach(s => { extras[s.dataset.id] = s.value; });
        done({ sel, extras });
      };
    });
  }

  // =====================================================================
  // 1) Excel de jugadores/as y equipos
  // =====================================================================
  function guessCategory(s) {
    const n = norm(s);
    if (/\bESCUELA\b/.test(n)) return "Escuela";
    if (/\bMIXTO\b/.test(n)) return "Mixto";
    if (/\bALEVIN\b|\bBENJAMIN\b/.test(n)) return "Alevín";
    if (/\bINFANTIL\b/.test(n)) return "Infantil";
    if (/\bCADETE\b/.test(n)) return "Cadete";
    if (/\bJUVENIL\b/.test(n)) return "Juvenil";
    if (/\bJUNIOR\b/.test(n)) return "Junior";
    if (/\bSENIOR\b/.test(n) && /\bMASC/.test(n)) return "Senior Masculino";
    if (/\bSENIOR\b/.test(n)) return "Senior Femenino";
    return "Mixto";
  }

  // Busca el equipo del Excel entre los de la app; si no está, propone nombre y categoría.
  function resolveTeam(label) {
    const s = label.replace(/\s+/g, " ").trim();
    const n = norm(s);
    const ex = appData.teams.find(t => norm(getTeamKey(t)) === n) || appData.teams.find(t => norm(t.name) === n);
    if (ex) return { key: getTeamKey(ex), exists: true };
    const m = s.match(/^(.*?)\s*\(([^)]+)\)$/);
    const name = m ? m[1].trim() : s;
    let cat = m ? m[2].trim() : guessCategory(s);
    const known = CATEGORIES.find(c => norm(c) === norm(cat));
    if (known) cat = known;
    return { key: `${name} (${cat})`, name, cat, exists: false };
  }

  function readExcelRows(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (!rows.length) return [];
    const head = rows[0].map(h => norm(String(h)));
    let cN = head.findIndex(h => h === "NOMBRE");
    let cA = head.findIndex(h => h.startsWith("APELLIDO"));
    let cE = head.findIndex(h => h.startsWith("EQUIPO"));
    const hasHeader = cN >= 0 || cE >= 0;
    if (cN < 0) cN = 0;
    if (cA < 0) cA = 1;
    if (cE < 0) cE = 2;
    return rows.slice(hasHeader ? 1 : 0).map(r => ({
      player: `${String(r[cN] || "").trim()} ${String(r[cA] || "").trim()}`.replace(/\s+/g, " ").trim(),
      team: String(r[cE] || "").replace(/\s+/g, " ").trim()
    })).filter(r => r.player && r.team && !/NO VALIDA/.test(norm(r.team)));
  }

  const tokens = (s) => norm(s).split(" ").filter(Boolean);
  // Mismo jugador con el nombre más corto en la app (p. ej. «Laura Torres» y «Laura Torres Cervera»)
  const isShortFormOf = (shortN, longN) => {
    const a = tokens(shortN), b = tokens(longN);
    return a.length >= 2 && a.length < b.length && a.every(t => b.includes(t)) && a[0] === b[0];
  };

  function diffPlayers(teamsMap) {
    const groups = [], plan = {};
    let id = 0;
    teamsMap.forEach((players, label) => {
      const t = resolveTeam(label);
      const current = t.exists ? getPlayersForTeamKey(t.key).slice() : [];
      const used = new Set();
      const items = [];
      const pl = { team: t, add: [], rename: [], remove: [] };
      const xlsUnmatched = [];
      players.forEach(p => {
        const i = current.findIndex((c, k) => !used.has(k) && norm(c) === norm(p));
        if (i >= 0) used.add(i); else xlsUnmatched.push(p);
      });
      xlsUnmatched.forEach(p => {
        const i = current.findIndex((c, k) => !used.has(k) && isShortFormOf(c, p));
        if (i >= 0) {
          used.add(i);
          const iid = `r${id++}`;
          pl.rename.push({ id: iid, from: current[i], to: p });
          items.push({ id: iid, label: `✏️ ${esc(current[i])} → ${esc(p)}`, checked: false, cls: "imp-ren" });
        } else {
          const iid = `a${id++}`;
          pl.add.push({ id: iid, name: p });
          items.push({ id: iid, label: `➕ ${esc(p)}`, checked: true, cls: "imp-add" });
        }
      });
      current.forEach((c, k) => {
        if (used.has(k)) return;
        const iid = `d${id++}`;
        pl.remove.push({ id: iid, name: c });
        items.push({ id: iid, label: `➖ ${esc(c)} <small>(no está en el Excel)</small>`, checked: false, cls: "imp-del" });
      });
      if (!t.exists) {
        const tid = `t${id++}`;
        pl.newTeamId = tid;
        items.unshift({ id: tid, label: `🆕 Crear el equipo <b>${esc(t.name)}</b> · categoría <select data-id="cat_${tid}">${CATEGORIES.map(c => `<option${c === t.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`, checked: true, cls: "imp-add" });
      }
      if (items.length) {
        groups.push({ title: t.exists ? t.key : `${t.name} (nuevo)`, extra: ` <small>· ${players.length} en el Excel</small>`, items });
        plan[label] = pl;
      }
    });
    return { groups, plan };
  }

  async function handleExcel(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    let rows;
    mostrarCargando("Leyendo el Excel...");
    try {
      await ensureXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      rows = readExcelRows(wb);
    } catch (e) {
      console.error(e);
      ocultarCargando();
      alert("No se pudo leer el Excel. La primera vez hace falta conexión para descargar el lector de Excel.");
      return;
    }
    ocultarCargando();
    if (!rows.length) { alert("No he encontrado jugadores/as en el Excel (columnas Nombre, Apellidos y Equipos)."); return; }

    const teamsMap = new Map();
    rows.forEach(r => {
      if (!teamsMap.has(r.team)) teamsMap.set(r.team, []);
      const list = teamsMap.get(r.team);
      if (!list.some(p => norm(p) === norm(r.player))) list.push(r.player);
    });

    const { groups, plan } = diffPlayers(teamsMap);
    if (!groups.length) { alert(`El Excel coincide con los datos actuales (${rows.length} jugadores/as en ${teamsMap.size} equipos). No hay nada que cambiar.`); return; }

    const res = await askDiffs("Diferencias con el Excel",
      `${rows.length} jugadores/as en ${teamsMap.size} equipos. Marca lo que quieras cargar o modificar.<br><small>➕ añadir · ✏️ cambiar nombre · ➖ quitar (los dos últimos vienen desmarcados porque el historial va por nombre).</small>`,
      groups, "Aplicar cambios");
    if (!res) return;

    let nTeams = 0, nAdd = 0, nRen = 0, nDel = 0;
    Object.values(plan).forEach(pl => {
      let key = pl.team.key;
      if (pl.newTeamId) {
        if (!res.sel.has(pl.newTeamId)) return;   // sin equipo no se cargan sus jugadores/as
        const cat = res.extras[`cat_${pl.newTeamId}`] || pl.team.cat;
        key = `${pl.team.name} (${cat})`;
        if (!appData.teams.some(t => getTeamKey(t) === key)) { appData.teams.push({ name: pl.team.name, category: cat }); nTeams++; }
      }
      const list = ensurePlayerListExists(key);
      pl.rename.forEach(r => { if (!res.sel.has(r.id)) return; const i = list.indexOf(r.from); if (i >= 0) { list[i] = r.to; nRen++; } });
      pl.remove.forEach(r => { if (!res.sel.has(r.id)) return; const i = list.indexOf(r.name); if (i >= 0) { list.splice(i, 1); nDel++; } });
      pl.add.forEach(r => { if (res.sel.has(r.id) && !list.includes(r.name)) { list.push(r.name); nAdd++; } });
    });
    if (!(nTeams || nAdd || nRen || nDel)) { alert("No se ha aplicado ningún cambio."); return; }
    saveDataAndSyncGitHub();
    renderConfigTab2Select();
    alert(`Cambios aplicados:\n- Equipos nuevos: ${nTeams}\n- Jugadores/as añadidos: ${nAdd}\n- Nombres cambiados: ${nRen}\n- Jugadores/as quitados: ${nDel}`);
  }

  window.impPickExcel = () => document.getElementById("impExcelInput").click();
  window.impHandleExcel = handleExcel;

  // =====================================================================
  // 2) Ligas desde los PDF de la federación guardados en GitHub
  // =====================================================================
  async function fetchCalendarPdf(key) {
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${CAL_FOLDER}/${encodeURIComponent(sanitizeFileName(key))}.pdf`;
    const headers = { "Accept": "application/vnd.github.raw" };
    if (ghSettings.token) headers.Authorization = `token ${ghSettings.token}`;
    const r = await fetch(url, { headers, cache: "no-store" });
    if (!r.ok) return null;
    const b = await r.blob();
    return b.size ? b : null;
  }

  const isClubName = (n) => /\bNVA\b|NOU VOLEI ALZIRA|NOU VOLEI CLUB ALZIRA/.test(norm(n));

  // Rivales de la liga: tabla de CLASIFICACIÓN del PDF; si no la hay (o no se reconoce
  // el equipo), los rivales de sus partidos ya leídos en «Calendario de partidos».
  function rivalsFor(team, key, rows, cpTeam) {
    if (rows.length >= 2) {
      let own = -1;
      if (cpTeam && cpTeam.fedName) own = findOwnTeamRow(rows, cpTeam.fedName);
      if (own < 0) own = findOwnTeamRow(rows, team.name);
      if (own < 0) {
        const club = rows.map((r, i) => i).filter(i => isClubName(rows[i].name));
        if (club.length === 1) own = club[0];
      }
      if (own >= 0) return { list: rows.filter((_, i) => i !== own).map(r => r.name), from: "clasificación" };
    }
    if (cpTeam && cpTeam.matches && cpTeam.matches.length) {
      const seen = new Set(), list = [];
      cpTeam.matches.forEach(m => {
        const n = (m.rival || "").trim();
        if (!n || /DESCANSA/.test(norm(n)) || seen.has(norm(n))) return;
        seen.add(norm(n)); list.push(n);
      });
      if (list.length) return { list, from: "partidos" };
    }
    return null;
  }

  async function importLeagues() {
    if (!(ghSettings.user && ghSettings.repo)) { alert("Configura primero la conexión con GitHub (pestaña Conexión GitHub)."); return; }
    if (!navigator.onLine) { alert("Hace falta conexión para leer los PDF de GitHub."); return; }
    const teams = appData.teams.slice();
    if (!teams.length) { alert("No hay equipos configurados."); return; }
    let cpData = {};
    try { cpData = JSON.parse(localStorage.getItem("NVA_CALENDARIO_PARTIDOS") || "{}") || {}; } catch (e) { cpData = {}; }
    const cpTeams = cpData.teams || {};

    await leagueWriteChain;
    if (offlineQueue.length > 0) await processOfflineQueue();

    const diffs = [], notes = [];
    try {
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i], key = getTeamKey(team);
        mostrarCargando(`Leyendo ${i + 1}/${teams.length}: ${key}...`);
        let blob = null;
        try { blob = await fetchCalendarPdf(key); } catch (e) { console.warn(e); }
        if (!blob) { notes.push(`- ${key}: sin PDF en ${CAL_FOLDER}`); continue; }
        let rows = [];
        try { rows = await extractStandingsTeamsFromPdf(blob); } catch (e) { console.warn(e); notes.push(`- ${key}: no se pudo leer el PDF`); continue; }
        const r = rivalsFor(team, key, rows, cpTeams[key]);
        if (!r) { notes.push(`- ${key}: no he encontrado la liga en el PDF`); continue; }
        const current = await fetchLeagueTeamsForTeam(key);
        const have = new Set(current.map(norm)), want = new Set(r.list.map(norm));
        const added = r.list.filter(n => !have.has(norm(n)));
        const removed = current.filter(n => !want.has(norm(n)));
        if (!added.length && !removed.length) { notes.push(`- ${key}: sin cambios (${current.length} equipos)`); continue; }
        // Se respeta el orden que ya tenía la lista y se añaden al final los nuevos
        const finalList = current.filter(n => want.has(norm(n))).concat(added);
        diffs.push({ key, finalList, added, removed, from: r.from, before: current.length });
      }
    } finally {
      ocultarCargando();
    }

    if (!diffs.length) { alert("Ligas revisadas: no hay diferencias.\n\n" + notes.join("\n")); return; }

    const groups = diffs.map((d, i) => ({
      title: d.key,
      extra: ` <small>· ${d.before} → ${d.finalList.length} equipos (${d.from})</small>`,
      items: [{ id: `L${i}`, checked: true, cls: "imp-league",
        label: `Actualizar esta liga<div class="imp-sub">${d.added.map(n => `<div class="imp-add">➕ ${esc(n)}</div>`).join("")}${d.removed.map(n => `<div class="imp-del">➖ ${esc(n)}</div>`).join("")}</div>` }]
    }));
    const res = await askDiffs("Diferencias en las ligas",
      `${diffs.length} de ${teams.length} equipos tienen cambios respecto a los PDF de ${CAL_FOLDER}. Marca las ligas que quieras actualizar.${notes.length ? `<details class="imp-notes"><summary>${notes.length} equipos sin cambios o sin PDF</summary><small>${notes.map(esc).join("<br>")}</small></details>` : ""}`,
      groups, "Actualizar ligas");
    if (!res) return;

    const done = [];
    diffs.forEach((d, i) => {
      if (!res.sel.has(`L${i}`)) return;
      const snapshot = d.finalList.slice();
      localStorage.setItem(`NVA_LEAGUE_${sanitizeFileName(d.key)}`, JSON.stringify(snapshot));
      if (ghSettings.user && ghSettings.repo && ghSettings.token) {
        leagueWriteChain = leagueWriteChain
          .then(() => saveLeagueTeamsToGitHub(d.key, snapshot))
          .catch(e => console.error("Error al guardar la liga:", e));
      }
      if (leagueEdit && leagueEdit.key === d.key) { leagueEdit.list = snapshot.slice(); renderLeagueManagement(); }
      done.push(`- ${d.key}: ${snapshot.length} equipos`);
    });
    alert(done.length ? "Ligas actualizadas:\n\n" + done.join("\n") : "No se ha actualizado ninguna liga.");
  }

  window.impLeaguesFromPdfs = () => importLeagues().catch(e => { console.error(e); ocultarCargando(); alert("Error al cargar las ligas: " + e.message); });
})();
