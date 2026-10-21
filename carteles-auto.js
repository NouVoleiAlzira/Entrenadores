/* =====================================================================
   Carteles · carga automática
   «Partidos de la semana» y «Resultados de la semana» se rellenan con los
   datos de «Calendario de partidos» (PDF de fvbcv.com ya leídos).
   Antes de abrir la página del cartel se muestra una ventana con los
   partidos para elegir cuáles se pasan. Los datos viajan a Partidos.html /
   Resultados.html por localStorage (NVA_CARTEL_AUTO).
   Al cargar resultados también se rellena el marcador del registro del
   partido (carpeta Partidos/ de GitHub) de ese equipo y ese día.
   ===================================================================== */
(function () {
  "use strict";

  const AUTO_KEY = "NVA_CARTEL_AUTO";
  const esc = (v) => escapeHtml(v);
  // En los PDF el apóstrofo sale como coma: "L,ILLA" -> "L'ILLA"
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtDay = (s) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const dayName = (s) => DIAS[new Date(s + "T12:00:00").getDay()];

  // Resultado del texto de la fila del PDF: "LOCAL 3 - 1 (25-20/18-25/25-22/25-19) VISITANTE"
  function parseResult(raw) {
    const m = String(raw || "").match(/\s(\d)\s*-\s*(\d)\s*\(([\d\s\-\/]+)\)/);
    if (!m) return null;
    const sets = m[3].split("/").map(x => x.trim().match(/^(\d+)\s*-\s*(\d+)$/)).filter(Boolean)
      .map(x => ({ local: parseInt(x[1], 10), visitante: parseInt(x[2], 10) }));
    return { setsL: parseInt(m[1], 10), setsV: parseInt(m[2], 10), sets };
  }

  // Fin de semana anterior (o el actual si hoy es sábado o domingo) para los resultados
  function lastWeekend() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    const wd = d.getDay();   // 0 dom ... 6 sáb
    const sun = new Date(d);
    if (wd !== 0) sun.setDate(d.getDate() - wd + (wd === 6 ? 7 : 0));
    const sat = new Date(sun); sat.setDate(sun.getDate() - 1);
    return { from: iso(sat), to: iso(sun) };
  }

  function teamsByKey() {
    const map = {};
    ((typeof appData !== "undefined" && appData.teams) || []).forEach(t => { map[getTeamKey(t)] = t; });
    return map;
  }

  // Partidos de los equipos del club entre dos fechas (con el cambio local/visitante aplicado)
  function collect(from, to, results) {
    const cp = (window.cpGetData && window.cpGetData()) || {};
    const teams = teamsByKey(), out = [];
    Object.entries(cp.teams || {}).forEach(([key, info]) => {
      const team = teams[key];
      if (!team) return;
      (info.matches || []).forEach(m => {
        if (!m.date || m.date < from || m.date > to) return;
        const mk = [key, m.date, m.rival, m.jornada].join("|");
        const home = cp.homeOv && mk in cp.homeOv ? cp.homeOv[mk] : m.home !== false;
        const res = results ? parseResult(m.raw) : null;
        out.push({ key, team: { name: team.name, category: team.category }, fecha: m.date, hora: m.time && m.time !== "00:00" ? m.time : "",
          rival: m.rival || "", home, campo: m.venue || "", res });
      });
    });
    // Partido entre dos equipos del club: una sola entrada (la del equipo local)
    const norm = (x) => normalizeTeamName(x);
    const deDos = out.filter(p => !(!p.home && out.some(q => q !== p && q.home && q.fecha === p.fecha && q.hora === p.hora &&
      norm(q.rival) === norm(p.team.name) && norm(p.rival) === norm(q.team.name))));
    return deDos.sort((a, b) => (a.fecha + (a.hora || "99")).localeCompare(b.fecha + (b.hora || "99")) || a.key.localeCompare(b.key));
  }

  // ---------- Ventana para elegir los partidos ----------
  function askMatches(tipo, range) {
    const results = tipo === "resultados";
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${results ? "🏆 Resultados de la semana" : "📅 Partidos de la semana"}</div>
        <div class="ca-range">
          <label>Desde <input type="date" class="ca-from" value="${range.from}"></label>
          <label>Hasta <input type="date" class="ca-to" value="${range.to}"></label>
        </div>
        <div class="cp-modal-txt ca-info"></div>
        <div class="imp-list ca-list"></div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">${results ? "Pasar resultados" : "Pasar partidos"}</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      let items = [];
      const list = o.querySelector(".ca-list"), info = o.querySelector(".ca-info");
      const fill = () => {
        const from = o.querySelector(".ca-from").value, to = o.querySelector(".ca-to").value;
        items = from && to ? collect(from, to, results) : [];
        const ok = items.filter(p => !results || p.res).length;
        info.innerHTML = items.length
          ? `${ok} partido${ok === 1 ? "" : "s"}${results && ok < items.length ? ` con resultado (${items.length - ok} todavía sin resultado)` : ""}. Marca los que quieras pasar al cartel${results ? " y al registro del partido" : ""}.`
          : `No hay partidos de los equipos del club entre esas fechas en «Calendario de partidos».`;
        list.innerHTML = items.map((p, i) => {
          const local = p.home ? p.key : apos(p.rival), visit = p.home ? apos(p.rival) : p.key;
          const score = p.res ? ` <b class="ca-score">${p.res.setsL} - ${p.res.setsV}</b> ` : " vs ";
          const dis = results && !p.res;
          return `<label class="imp-item ca-item${dis ? " ca-off" : ""}"><input type="checkbox" data-i="${i}" ${dis ? "disabled" : "checked"}>
            <span><b>${dayName(p.fecha)} ${fmtDay(p.fecha)}${p.hora ? " · " + p.hora : ""}</b> ${p.home ? "🏠" : "✈️"}<br>${esc(local)}${score}${esc(visit)}${dis ? " <small>(sin resultado)</small>" : ""}${p.campo ? `<br><small>${esc(apos(p.campo))}</small>` : ""}</span></label>`;
        }).join("");
      };
      o.querySelector(".ca-from").onchange = fill;
      o.querySelector(".ca-to").onchange = fill;
      fill();
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const sel = Array.from(list.querySelectorAll("input:checked")).map(c => items[+c.dataset.i]).filter(Boolean);
        if (!sel.length) { alert("Marca al menos un partido."); return; }
        done({ sel, from: o.querySelector(".ca-from").value, to: o.querySelector(".ca-to").value });
      };
    });
  }

  // ---------- Resultado en el registro del partido (Partidos/Partidos_<equipo>_<fecha>.json) ----------
  function buildMarcador(p) {
    return {
      local: p.home ? p.key : p.rival,
      visitante: p.home ? p.rival : p.key,
      sets: Array.from({ length: MATCH_SETS_COUNT }, (_, i) => p.res.sets[i] || { local: null, visitante: null }),
      setsLocal: p.res.setsL,
      setsVisitante: p.res.setsV
    };
  }
  const findLog = (p) => allMatchLogs.find(l => l.equipo === p.key && l.fecha === p.fecha);
  const numOrNull = (v) => (v === "" || v == null || isNaN(+v)) ? null : +v;
  // Texto del marcador para comparar y para enseñarlo: "3-1 (25-20, 18-25, 25-22, 25-19)"
  function marcadorTxt(m) {
    if (!m) return "";
    const sets = (m.sets || []).map(x => [numOrNull(x && x.local), numOrNull(x && x.visitante)])
      .filter(x => x[0] != null || x[1] != null).map(x => `${x[0] ?? "-"}-${x[1] ?? "-"}`);
    const tot = numOrNull(m.setsLocal) == null && numOrNull(m.setsVisitante) == null ? "" : `${numOrNull(m.setsLocal) ?? "-"}-${numOrNull(m.setsVisitante) ?? "-"}`;
    return (tot + (sets.length ? ` (${sets.join(", ")})` : "")).trim();
  }
  // Partidos cuyo resultado ya estaba grabado y es distinto: se pregunta cuáles se reescriben
  function askOverwrite(list) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">✏️ Resultados distintos a los grabados</div>
        <div class="cp-modal-txt">Estos partidos ya tienen un resultado grabado en su registro que no coincide con el del PDF. Marca los que quieras reescribir.</div>
        <div class="imp-list">${list.map((c, i) => `<label class="imp-item ca-item"><input type="checkbox" data-i="${i}" checked>
          <span><b>${fmtDay(c.p.fecha)} · ${esc(c.p.key)}</b> ${c.p.home ? "🏠" : "✈️"} ${esc(apos(c.p.rival))}<br>
          Grabado: <s>${esc(marcadorTxt(c.old))}</s><br>Nuevo: <b class="ca-score">${esc(marcadorTxt(c.nuevo))}</b></span></label>`).join("")}</div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">No reescribir</button>
          <button class="cp-modal-btn cp-modal-main">Reescribir marcados</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done([]);
      o.querySelector(".cp-modal-main").onclick = () => done(Array.from(o.querySelectorAll("input:checked")).map(c => list[+c.dataset.i]));
    });
  }

  async function saveResultToMatchLog(p, marcador) {
    let log = findLog(p);
    if (!log) {
      const coach = (appData.coaches || []).find(c => (c.teams || []).includes(p.key));
      log = { fecha: p.fecha, equipo: p.key, entrenador: coach ? coach.name : "", jugadores: [] };
      allMatchLogs.push(log);
    }
    log.marcador = marcador;
    localStorage.setItem("NVA_MATCH_LOGS", JSON.stringify(allMatchLogs));
    return writeGitHubFile(`${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(p.key)}_${p.fecha}.json`, log, `Resultado partido ${p.key} - ${p.fecha}`);
  }

  // ---------- Primero solo las fechas (sin leer nada todavía) ----------
  function askDates(tipo, range) {
    const results = tipo === "resultados";
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${results ? "🏆 Resultados de la semana" : "📅 Partidos de la semana"}</div>
        <div class="cp-modal-txt">Elige las fechas. Después se cargan los datos${results ? " y las fotos" : ""}.</div>
        <div class="ca-range">
          <label>Desde <input type="date" class="ca-from" value="${range.from}"></label>
          <label>Hasta <input type="date" class="ca-to" value="${range.to}"></label>
        </div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">Cargar datos</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const from = o.querySelector(".ca-from").value, to = o.querySelector(".ca-to").value;
        if (!from || !to) { alert("Elige las dos fechas."); return; }
        done(from <= to ? { from, to } : { from: to, to: from });
      };
    });
  }

  async function run(tipo) {
    const results = tipo === "resultados";
    const range0 = results ? lastWeekend() : ((window.cpGetRange && window.cpGetRange()) || {});
    if (!range0.from || !range0.to) { const w = lastWeekend(); range0.from = range0.from || w.from; range0.to = range0.to || w.to; }
    // Primero se eligen las fechas; luego se leen los PDF más nuevos de GitHub
    const range = await askDates(tipo, range0);
    if (!range) return;
    if (window.cpRefreshFromGitHub && typeof ghSettings !== "undefined" && ghSettings.token && navigator.onLine) {
      mostrarCargando("Revisando los PDF guardados en GitHub...");
      // La revisión oculta la pantalla de carga entre PDF y PDF: se mantiene visible hasta terminar
      const ov = document.getElementById("loadingOverlay");
      const keep = new MutationObserver(() => { if (ov && !ov.classList.contains("active")) ov.classList.add("active"); });
      if (ov) keep.observe(ov, { attributes: true, attributeFilter: ["class"] });
      try { await window.cpRefreshFromGitHub(); } catch (e) { console.warn(e); }
      finally { keep.disconnect(); ocultarCargando(); }
    }
    const ans = await askMatches(tipo, range);
    if (!ans) return;

    let resumenRegistro = "";
    if (results) {
      // Registros de partido: se sincronizan antes para no pisar datos de otros dispositivos
      mostrarCargando("Guardando los resultados en los registros de partido...");
      try {
        if (ghSettings.user && ghSettings.repo && navigator.onLine) {
          if (offlineQueue.length > 0) await processOfflineQueue();
          await fetchMatchLogsFromGitHub();
        }
        // Sin resultado grabado: se graba. Igual al grabado: no se toca. Distinto: se pregunta.
        const nuevos = [], distintos = [];
        ans.sel.forEach(p => {
          const nuevo = buildMarcador(p), log = findLog(p), old = log && log.marcador;
          const oldTxt = marcadorTxt(old);
          if (!oldTxt) nuevos.push({ p, nuevo });
          else if (oldTxt !== marcadorTxt(nuevo)) distintos.push({ p, nuevo, old });
        });
        let reescribir = [];
        if (distintos.length) { ocultarCargando(); reescribir = await askOverwrite(distintos); mostrarCargando("Guardando los resultados en los registros de partido..."); }
        for (const c of nuevos.concat(reescribir)) await saveResultToMatchLog(c.p, c.nuevo);
        const iguales = ans.sel.length - nuevos.length - distintos.length;
        resumenRegistro = `Registros de partido: ${nuevos.length} nuevo(s), ${reescribir.length} reescrito(s), ${iguales} sin cambios` +
          (distintos.length - reescribir.length ? `, ${distintos.length - reescribir.length} sin reescribir` : "") + ".";
      } catch (e) {
        console.error(e);
        alert("No se pudieron guardar todos los resultados en los registros de partido: " + e.message);
      } finally { ocultarCargando(); }
    }

    const datos = {
      tipo, creado: new Date().toISOString(), desde: ans.from, hasta: ans.to, resumenRegistro,
      partidos: ans.sel.map(p => ({ team: p.team, key: p.key, fecha: p.fecha, hora: p.hora, rival: p.rival, home: p.home, campo: p.campo,
        setsL: p.res ? p.res.setsL : null, setsV: p.res ? p.res.setsV : null }))
    };
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(datos)); } catch (e) { alert("No se pudieron preparar los datos del cartel."); return; }
    location.href = (results ? "Resultados.html" : "Partidos.html") + "?auto=1";
  }

  window.cartelAuto = (tipo) => run(tipo).catch(e => { console.error(e); ocultarCargando(); alert("Error en la carga automática: " + e.message); });
})();
