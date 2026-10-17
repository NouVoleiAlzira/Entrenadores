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
  setTimeout(() => { if (revisarEstadosCambios()) { saveLocal(); render(); } }, 0);

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
    if (open) { render(); if (subState().teams) autoCheckPdfs(); }
  }
  window.cpToggleSection = function () {
    const open = document.getElementById("secBody_cal").classList.contains("collapsed");
    try { localStorage.setItem(CP_OPEN, open ? "1" : "0"); } catch (e) {}
    setOpen(open);
  };
  window.cpSectionKey = function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); window.cpToggleSection(); }
  };

  // ---------- Rango de fechas con el calendario nativo del dispositivo ----------
  const shortDay = (iso) => { const d = new Date(iso + "T12:00:00"); return `${DIAS[d.getDay()]} ${fmtDay(iso).slice(0, 5)}`; };
  function updateRangeLabel() {
    const f = document.getElementById("cpFrom").value, t = document.getElementById("cpTo").value;
    document.getElementById("cpFromLabel").textContent = f ? shortDay(f) : "--";
    document.getElementById("cpToLabel").textContent = t ? shortDay(t) : "--";
    document.getElementById("cpTo").min = f || "";
  }
  function onFromChange() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (!from.value) return;
    if (!to.value || to.value < from.value) { // fin por defecto: 6 días después
      const d = new Date(from.value + "T12:00:00"); d.setDate(d.getDate() + 6); to.value = isoDay(d);
    }
    updateRangeLabel(); renderMatches();
    // Tras elegir el inicio se abre directamente el calendario del fin (si el navegador lo permite)
    setTimeout(() => { try { if (to.showPicker) to.showPicker(); } catch (e) {} }, 150);
  }
  function onToChange() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (to.value && from.value && to.value < from.value) { const x = from.value; from.value = to.value; to.value = x; }
    updateRangeLabel(); renderMatches();
  }

  // ---------- Pintado ----------
  function render() { renderMatches(); renderTeams(); }

  // =====================================================================
  //  PLANIFICACIÓN: línea temporal, avisos y encaje de partidos sin hora
  //  Premisas en casa (Palau): una franja por fin de semana (sáb/dom mañana/tarde),
  //  2 pistas, infantil/cadete preferiblemente por la mañana, juvenil/senior nunca
  //  sábado por la mañana, y un entrenador no puede tener 2 partidos a la vez (2 h).
  // =====================================================================
  const DUR = 120;                 // duración de un partido (min)
  const TARDE = 15 * 60;           // a partir de las 15:00 es «tarde»
  const PISTAS = 2;
  const FRANJA_TXT = { "6M": "sábado mañana", "6T": "sábado tarde", "0M": "domingo mañana", "0T": "domingo tarde" };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toHHMM = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  const dow = (iso) => new Date(iso + "T12:00:00").getDay();
  const hasTime = (m) => !!m.time && m.time !== "00:00";
  const isRest = (m) => /DESCANS/i.test(m.rival || "") || /\bDESCANSA\b/i.test(m.raw || "");
  const moveKey = (team, m) => [team, m.date, m.rival || "", m.jornada || ""].join("|");

  function teamObj(key) { return ((typeof appData !== "undefined" && appData.teams) || []).find(t => getTeamKey(t) === key); }
  function teamGroup(key) {   // "base" = infantil/cadete (y menores), "mayor" = juvenil/senior
    const t = teamObj(key);
    const c = normalizeTeamName((t && t.category) || key);
    if (/JUVENIL|SENIOR|SENIO|ABSOLUT/.test(c)) return "mayor";
    if (/INFANTIL|CADETE|CADET|ALEVIN|BENJAMIN|ESCOLA/.test(c)) return "base";
    return "";
  }
  function teamCoaches(key) {
    const coaches = (typeof appData !== "undefined" && appData.coaches) || [];
    return coaches.filter(c => (c.teams || []).some(ref => {
      if (ref === key) return true;
      const t = ((appData && appData.teams) || []).find(x => getTeamKey(x) === ref || x.name === ref);
      return !!t && getTeamKey(t) === key;
    })).map(c => c.name);
  }
  const isHome = (m) => m.forced ? m.home === true : (m.home === true || /PALAU/i.test(m.venue || ""));
  const placeOf = (m) => isHome(m) ? "Palau" : (m.forced || !m.venue ? `campo de ${m.rival || "rival"}` : m.venue);
  const isWeekend = (iso) => { const d = dow(iso); return d === 6 || d === 0; };
  const franja = (m) => isWeekend(m.date) ? `${dow(m.date)}${m.start < TARDE ? "M" : "T"}` : "";
  function weekendKey(iso) { const d = new Date(iso + "T12:00:00"); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return isoDay(d); }
  const overlap = (a, b) => a.date === b.date && a.start < b.start + DUR && b.start < a.start + DUR;
  const short = (key) => { const t = teamObj(key); return t ? `${t.name} ${String(t.category || "").slice(0, 3)}.` : key; };

  // Avisos de un conjunto de partidos (con .start en minutos). Devuelve [{level, text, ids:[...] }]
  function checkRules(ms) {
    const out = [];
    const add = (level, text, list) => out.push({ level, text, ids: list.map(m => m.id) });
    const home = ms.filter(isHome);
    // 1. Una sola franja por fin de semana
    const byWk = {};
    home.filter(m => isWeekend(m.date)).forEach(m => { (byWk[weekendKey(m.date)] = byWk[weekendKey(m.date)] || []).push(m); });
    Object.keys(byWk).forEach(wk => {
      const cnt = {};
      byWk[wk].forEach(m => { const f = franja(m); cnt[f] = (cnt[f] || 0) + 1; });
      const fr = Object.keys(cnt);
      if (fr.length > 1) {
        const main = fr.sort((a, b) => cnt[b] - cnt[a])[0];
        add("alta", `Fin de semana ${fmtDay(wk).slice(0, 5)}: se usan ${fr.length} franjas en el Palau (${fr.map(f => FRANJA_TXT[f]).join(", ")}). Solo se puede pedir una.`, byWk[wk].filter(m => franja(m) !== main));
      }
    });
    // 2. Máximo 2 pistas a la vez
    const seenCourt = new Set();
    home.forEach(m => {
      const at = home.filter(o => o.date === m.date && o.start <= m.start && m.start < o.start + DUR);
      if (at.length > PISTAS) {
        const k = at.map(o => o.id).sort().join(",");
        if (!seenCourt.has(k)) { seenCourt.add(k); add("alta", `${fmtDay(m.date).slice(0, 5)} ${toHHMM(m.start)}: ${at.length} partidos a la vez en el Palau y solo hay ${PISTAS} pistas.`, at); }
      }
    });
    home.forEach(m => {
      if (!isWeekend(m.date)) return;
      const g = teamGroup(m.team), f = franja(m);
      // 3. Infantil y cadete, preferiblemente por la mañana
      if (g === "base" && f.endsWith("T")) add("media", `${short(m.team)} juega en casa por la tarde (${FRANJA_TXT[f]}); infantil y cadete preferiblemente por la mañana.`, [m]);
      // 4. Juvenil y senior, nunca sábado por la mañana
      if (g === "mayor" && f === "6M") add("alta", `${short(m.team)} juega en casa el sábado por la mañana; juvenil y senior no pueden.`, [m]);
    });
    // 5 y aviso 2. Mismo entrenador: no puede jugar a la vez (2 h) y, si son campos distintos,
    //    necesita al menos 2 h entre el final de uno y el inicio del otro.
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      if (a.team === b.team || a.date !== b.date) continue;
      const common = a.coaches.filter(c => b.coaches.includes(c));
      if (!common.length) continue;
      const [p, q] = a.start <= b.start ? [a, b] : [b, a];
      const gap = q.start - (p.start + DUR);          // minutos entre el fin del 1º y el inicio del 2º
      const lugares = placeOf(a) !== placeOf(b);
      const who = `${common.join(", ")}: ${short(p.team)} (${toHHMM(p.start)}, ${placeOf(p)}) y ${short(q.team)} (${toHHMM(q.start)}, ${placeOf(q)})`;
      if (gap < 0) add("alta", `${who} se solapan${lugares ? " y en lugares distintos" : ""}.`, [a, b]);
      else if (lugares && gap < DUR) add("alta", `${who}: en campos distintos solo hay ${Math.floor(gap / 60)}h${pad(gap % 60)} entre el fin de uno y el inicio del otro (mínimo 2h).`, [a, b]);
    }
    return out;
  }
  const cost = (warns) => warns.reduce((s, w) => s + (w.level === "alta" ? 10 : 3), 0);

  // Encaja los partidos sin hora en la mejor hora posible (voraz: primero los más restringidos)
  function planMatches(all) {
    const fixed = all.filter(m => hasTime(m)).map(m => Object.assign(m, { start: toMin(m.time), placed: false }));
    // Partidos movidos a mano en la línea temporal (propuestos o confirmados): se respetan tal cual
    const moved = (cp.moved || {});
    fixed.forEach(m => { if (moved[m.mk]) Object.assign(m, { date: moved[m.mk].date, start: moved[m.mk].start, moved: true }); });
    all.filter(m => !hasTime(m) && moved[m.mk]).forEach(m => { Object.assign(m, { date: moved[m.mk].date, start: moved[m.mk].start, placed: true, moved: true }); fixed.push(m); });
    const free = all.filter(m => !hasTime(m) && !moved[m.mk]);
    free.sort((a, b) => (isHome(b) - isHome(a)) || ((teamGroup(b.team) === "mayor") - (teamGroup(a.team) === "mayor")) || a.date.localeCompare(b.date));
    const placed = fixed.slice();
    free.forEach(m => {
      const wk = isWeekend(m.date);
      const cands = [];
      for (let t = wk ? 9 * 60 : 17 * 60; t <= 20 * 60; t += 30) cands.push(t);
      let best = null, bestCost = Infinity;
      cands.forEach(t => {
        const trial = Object.assign({}, m, { start: t });
        const sameDay = placed.filter(o => o.date === m.date || (isHome(trial) && wk && weekendKey(o.date) === weekendKey(m.date)));
        let c = cost(checkRules(sameDay.concat([trial]))) * 100;
        const g = teamGroup(m.team);
        if (wk && g === "base" && t >= TARDE) c += 50;                    // preferencia de mañana
        if (wk && g === "mayor" && t < TARDE && dow(m.date) === 6) c += 50;
        // En casa: pegarse a los partidos ya fijados (bloques seguidos en las pistas)
        const homeSame = placed.filter(o => isHome(o) && o.date === m.date);
        if (isHome(m) && homeSame.length) c += Math.min(...homeSame.map(o => Math.abs(o.start - t))) / 60;
        else c += Math.abs(t - (wk ? (g === "mayor" ? 17 * 60 : 10 * 60) : 19 * 60)) / 600;  // horas habituales
        if (c < bestCost) { bestCost = c; best = t; }
      });
      m.start = best; m.placed = true;
      placed.push(m);
    });
    return placed;
  }

  // ---------- Subsecciones plegables ----------
  const SUB_KEY = "NVA_CP_SUBS";
  function subState() { try { return JSON.parse(localStorage.getItem(SUB_KEY)) || {}; } catch (e) { return {}; } }
  window.cpToggleSub = function (id) {
    const st = subState();
    const body = document.getElementById("cpSub_" + id);
    const open = body.classList.contains("collapsed");
    st[id] = open;
    try { localStorage.setItem(SUB_KEY, JSON.stringify(st)); } catch (e) {}
    applySub(id, open);
    if (open && id === "teams") { renderTeams(); autoCheckPdfs(); }
  };
  function applySub(id, open) {
    const head = document.getElementById("cpSubHead_" + id), body = document.getElementById("cpSub_" + id);
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open); body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function initSubs() {
    const st = subState();
    const def = { tl: true, warn: true, list: false, teams: false };
    Object.keys(def).forEach(id => applySub(id, st[id] === undefined ? def[id] : st[id]));
  }

  // ---------- Pintado de partidos, línea temporal y avisos ----------
  function renderMatches() {
    const list = document.getElementById("cpMatches");
    if (!list) return;
    const from = document.getElementById("cpFrom").value;
    const to = document.getElementById("cpTo").value;
    // Se planifica con fines de semana completos aunque el rango los corte
    const fromWk = from ? weekendKey(from) : "", toWk = to ? (() => { const d = new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1); return isoDay(d); })() : "";
    const all = [];
    let n = 0;
    Object.keys(cp.teams).forEach(key => {
      const coaches = teamCoaches(key);
      (cp.teams[key].matches || []).forEach(m => {
        if (isRest(m)) return;   // «DESCANSA» = no hay partido
        const mk = moveKey(key, m);
        const ov = (cp.homeOv || {})[mk];   // campo cambiado a mano (local/visitante)
        const extra = ov === undefined ? {} : { home: ov, forced: true };
        if ((!fromWk || m.date >= fromWk) && (!toWk || m.date <= toWk)) all.push(Object.assign({}, m, { id: "m" + (n++), mk, team: key, coaches }, extra));
      });
    });
    const planned = planMatches(all);
    const warns = checkRules(planned);
    const rows = planned.filter(m => (!from || m.date >= from) && (!to || m.date <= to))
      .sort((a, b) => (a.date + toHHMM(a.start)).localeCompare(b.date + toHHMM(b.start)));
    lastProposals = rows.filter(m => m.placed && !m.moved);
    lastConfirmed = rows.filter(m => hasTime(m) && !m.moved);   // fecha y hora oficiales, sin mover
    const ids = new Set(rows.map(m => m.id));
    const shownWarns = warns.filter(w => w.ids.some(i => ids.has(i)));
    const warnOf = {};
    shownWarns.forEach(w => w.ids.forEach(i => { (warnOf[i] = warnOf[i] || []).push(w); }));

    const tl = document.getElementById("cpTimeline"), wb = document.getElementById("cpWarnings");
    const wc = document.getElementById("cpWarnCount"), lc = document.getElementById("cpListCount");
    if (lc) lc.textContent = rows.length ? `(${rows.length})` : "";
    if (wc) { wc.textContent = shownWarns.length ? `(${shownWarns.length})` : ""; wc.className = shownWarns.length ? "cp-badge-warn" : ""; }

    if (!rows.length) {
      const any = Object.keys(cp.teams).length;
      const msg = `<div class="cp-empty">${any ? "No hay partidos en esas fechas." : "Aún no hay calendarios. Abre «Equipos» y sube el PDF de partidos de cada equipo."}</div>`;
      list.innerHTML = msg; if (tl) tl.innerHTML = msg; if (wb) wb.innerHTML = `<div class="cp-empty">Sin avisos.</div>`;
      return;
    }

    // --- Lista ---
    let html = "", lastDay = "";
    rows.forEach(m => {
      if (m.date !== lastDay) { lastDay = m.date; html += `<div class="cp-day">${DIAS[dow(m.date)]} ${fmtDay(m.date)}</div>`; }
      const vs = isHome(m) ? `<b>${esc(m.team)}</b> vs ${esc(m.rival || "?")}` : `${esc(m.rival || "?")} vs <b>${esc(m.team)}</b>`;
      const w = warnOf[m.id];
      html += `<div class="cp-match${m.placed ? " cp-placed" : ""}${w ? " cp-has-warn" : ""}">
        <div class="cp-time">${m.placed ? "≈" : ""}${toHHMM(m.start)}</div>
        <div class="cp-info">
          <div class="cp-vs">${vs}${w ? ' <span class="cp-warn-ico" title="Tiene avisos">⚠️</span>' : ""}</div>
          <div class="cp-meta">${isHome(m) ? "🏠 Local" : "🚌 Visitante"}${m.forced ? " (cambiado)" : ""}${m.venue && !m.forced ? " · " + esc(m.venue) : ""}${m.jornada ? " · J" + esc(m.jornada) : ""}${m.coaches.length ? " · " + esc(m.coaches.join(", ")) : ""}</div>
          ${m.placed ? '<div class="cp-meta cp-placed-note">Sin hora oficial: hora propuesta</div>' : ""}
        </div>
        <button type="button" class="cp-swap" data-mk="${esc(m.mk)}" data-home="${isHome(m) ? "0" : "1"}" onclick="cpSwapHome(this)" title="Cambiar campo">${isHome(m) ? "🚌 Pasar a visitante" : "🏠 Pasar a local"}</button>
        </div>`;
    });
    list.innerHTML = html;

    // --- Línea temporal: una fila por día con partidos ---
    if (tl) {
      let minH = 9, maxH = 21;
      rows.forEach(m => { minH = Math.min(minH, Math.floor(m.start / 60)); maxH = Math.max(maxH, Math.ceil((m.start + DUR) / 60)); });
      const span = (maxH - minH) * 60;
      const pct = (min) => ((min - minH * 60) / span * 100).toFixed(2) + "%";
      let ticks = "";
      for (let h = minH; h <= maxH; h += 2) ticks += `<span class="cp-tl-tick" style="left:${pct(h * 60)}">${h}h</span>`;
      const tardeBg = TARDE > minH * 60 && TARDE < maxH * 60 ? `<div class="cp-tl-tarde" style="left:${pct(TARDE)}"></div>` : "";
      let t = `<div class="cp-tl-axis"><div class="cp-tl-label"></div><div class="cp-tl-ticks">${ticks}</div></div>`;
      const days = [];
      if (from && to) { const d = new Date(from + "T12:00:00"); while (isoDay(d) <= to && days.length < 92) { days.push(isoDay(d)); d.setDate(d.getDate() + 1); } }
      rows.forEach(m => { if (!days.includes(m.date)) days.push(m.date); });
      days.sort();
      days.forEach(day => {
        const dm = rows.filter(m => m.date === day).sort((a, b) => a.start - b.start);
        const lanes = [];   // carriles para que no se monten los bloques
        dm.forEach(m => { let l = lanes.findIndex(end => end <= m.start); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = m.start + DUR; m.lane = l; });
        const fr = isWeekend(day) ? [...new Set(dm.filter(isHome).map(m => franja(m).endsWith("M") ? "mañana" : "tarde"))] : [];
        t += `<div class="cp-tl-row${dm.length ? "" : " empty"}" data-day="${day}"><div class="cp-tl-label"><b>${DIAS[dow(day)]}</b>${fmtDay(day).slice(0, 5)}${fr.length ? `<small>🏠 ${fr.join(" + ")}</small>` : ""}</div>
          <div class="cp-tl-track" style="height:${Math.max(1, lanes.length) * 34 + 4}px">${tardeBg}`;
        dm.forEach(m => {
          const w = warnOf[m.id];
          const cls = ["cp-tl-blk", isHome(m) ? "home" : "away", m.placed ? "placed" : "", m.moved ? "moved" : "", w ? "warn" : ""].join(" ");
          const tip = `${toHHMM(m.start)}${m.placed ? " (propuesta)" : ""}${m.moved ? " (movido)" : ""} · ${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}${m.coaches.length ? " · " + m.coaches.join(", ") : ""}${w ? "\n⚠ " + w.map(x => x.text).join("\n⚠ ") : ""}`;
          t += `<div class="${cls}" style="left:${pct(m.start)};width:${pct(minH * 60 + DUR)};top:${m.lane * 34 + 2}px" title="${esc(tip)}" onclick="cpShowMatch(this)" data-tip="${esc(tip)}" data-mk="${esc(m.mk)}" data-start="${m.start}">
            <span class="cp-tl-t">${w ? "⚠️" : ""}${m.moved ? "✎" : ""}${toHHMM(m.start)}</span><span class="cp-tl-n">${esc(short(m.team))}</span></div>`;
        });
        t += `</div></div>`;
      });
      const nCh = changeList().length;
      t += `<div class="cp-tl-legend"><span><i class="cp-lg home"></i>Casa</span><span><i class="cp-lg away"></i>Fuera</span><span><i class="cp-lg placed"></i>Hora propuesta</span><span><i class="cp-lg warn"></i>Aviso</span><span>✎ Movido</span></div>
        <div class="cp-tl-legend"><span class="cp-tl-hint">Toca un partido para ver el detalle. Mantén pulsado cualquier partido para moverlo (hora o día).</span></div>
        <div class="cp-tl-actions"><button type="button" class="cp-tl-btn" onclick="cpToggleChanges()">📝 Cambios realizados (${nCh}) ${changesOpen ? "▴" : "▾"}</button></div>
        <div class="cp-changes" id="cpChanges" style="${changesOpen ? "" : "display:none"}">${renderChanges()}</div>`;
      tl.dataset.minh = minH; tl.dataset.span = span;
      tl.innerHTML = t;
    }

    // --- Avisos ---
    if (wb) {
      wb.innerHTML = shownWarns.length
        ? shownWarns.map(w => `<div class="cp-warn ${w.level}">⚠️ ${esc(w.text)}${w.ids.some(i => planned.find(m => m.id === i && m.placed)) ? ' <span class="cp-warn-tag">incluye hora propuesta</span>' : ""}</div>`).join("")
        : `<div class="cp-empty cp-ok">✅ Todo cumple las premisas.</div>`;
    }
  }
  window.cpSwapHome = function (btn) {
    cp.homeOv = cp.homeOv || {};
    cp.homeOv[btn.getAttribute("data-mk")] = btn.getAttribute("data-home") === "1";
    saveMoves();
    renderMatches();
  };
  window.cpShowMatch = function (el) {
    if (drag.justDropped) { drag.justDropped = false; return; }
    alert(el.getAttribute("data-tip"));
  };

  // ---------- Mover partidos propuestos (mantener pulsado y arrastrar) ----------
  const drag = { timer: null, el: null, active: false, justDropped: false, x0: 0, y0: 0, dx: 0 };
  function saveMoves() {
    cp.updated = new Date().toISOString();
    saveLocal();
    if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
      writeGitHubFile(CP_FILE, cp, "Mover partido propuesto");
    }
  }
  // ---------- Lista de cambios realizados (movimientos y cambios de campo) ----------
  let changesOpen = false, changesAll = false, lastProposals = [], lastConfirmed = [];
  function selRange() {
    const f = document.getElementById("cpFrom"), t = document.getElementById("cpTo");
    return { from: f ? f.value : "", to: t ? t.value : "" };
  }
  const inSel = (d, r) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
  function matchByKey(mk) {
    for (const key of Object.keys(cp.teams)) for (const m of (cp.teams[key].matches || [])) if (moveKey(key, m) === mk) return Object.assign({ team: key }, m);
    return null;
  }
  const whenTxt = (date, time) => `${DIAS[dow(date)]} ${fmtDay(date).slice(0, 5)} ${time || "sin hora"}`;
  function changeList(all) {
    if (all === undefined) all = changesAll;
    const rg = selRange();
    const out = [];
    const keys = new Set(Object.keys(cp.moved || {}).concat(Object.keys(cp.homeOv || {})));
    keys.forEach(mk => {
      const m = matchByKey(mk);
      if (!m) return;
      const mv0 = (cp.moved || {})[mk];
      if (!all && !inSel(m.date, rg) && !(mv0 && inSel(mv0.date, rg))) return;
      const mv = (cp.moved || {})[mk], hv = (cp.homeOv || {})[mk];
      const vs = `${m.team} vs ${m.rival || "?"}`;
      const items = [];
      if (mv) items.push(`Horario: ${whenTxt(m.date, hasTime(m) ? m.time : "")} → ${whenTxt(mv.date, toHHMM(mv.start))}`);
      if (hv !== undefined) items.push(`Campo: ${hv ? "visitante → local" : "local → visitante"}`);
      out.push({ mk, vs, items, sort: (mv ? mv.date : m.date) + (mv ? toHHMM(mv.start) : (m.time || "")) });
    });
    return out.sort((a, b) => a.sort.localeCompare(b.sort));
  }
  function renderChanges() {
    const ch = changeList();
    const filt = `<div class="cp-change-actions"><button type="button" class="cp-tl-btn"${changesAll ? "" : ' style="background:var(--balon);color:var(--noche);border-color:var(--balon)"'} onclick="cpChangesScope(false)">Fechas seleccionadas</button>
         <button type="button" class="cp-tl-btn"${changesAll ? ' style="background:var(--balon);color:var(--noche);border-color:var(--balon)"' : ""} onclick="cpChangesScope(true)">TODOS</button></div>`;
    const pdfBtn = `<div class="cp-change-actions"><button type="button" class="cp-tl-btn" onclick="cpChangesPdf()">📄 Crear PDF</button></div>`;
    if (!ch.length) return filt + `<div class="cp-empty">No hay cambios${changesAll ? "" : " en las fechas seleccionadas"}. Mantén pulsado un partido para moverlo, o usa «Pasar a local/visitante» en la lista.</div>` + (lastProposals.length || lastConfirmed.length ? pdfBtn : "");
    return filt + ch.map(c => `<div class="cp-change"><div class="cp-change-txt"><b>${esc(c.vs)}</b>${c.items.map(i => `<div>${esc(i)}</div>`).join("")}</div>
        <button type="button" class="cp-change-undo" data-mk="${esc(c.mk)}" onclick="cpUndoChange(this)" title="Deshacer">↺</button></div>`).join("")
      + `<div class="cp-change-actions"><button type="button" class="cp-tl-btn" onclick="cpChangesPdf()">📄 Crear PDF</button>
         <button type="button" class="cp-tl-btn cp-tl-btn-red" onclick="cpResetMoves()">↺ Deshacer todos</button></div>`;
  }
  window.cpChangesScope = function (all) { changesAll = all; renderMatches(); };
  window.cpToggleChanges = function () { changesOpen = !changesOpen; renderMatches(); };
  window.cpUndoChange = function (btn) {
    const mk = btn.getAttribute("data-mk");
    if (cp.moved) delete cp.moved[mk];
    if (cp.homeOv) delete cp.homeOv[mk];
    saveMoves(); renderMatches();
  };
  window.cpResetMoves = function () {
    if (!confirm("¿Deshacer todos los cambios (movimientos y cambios de campo)?")) return;
    cp.moved = {}; cp.homeOv = {}; saveMoves(); renderMatches();
  };
  window.cpChangesPdf = async function () {
    const ch = changeList();
    // Partido entre dos equipos del club: sale una sola vez
    const conf = [], nT = (t) => normalizeTeamName(t || "");
    lastConfirmed.forEach(m => {
      if (conf.some(k => k.date === m.date && k.time === m.time && nT(k.team).startsWith(nT(m.rival)) && nT(m.team).startsWith(nT(k.rival)))) return;
      conf.push(m);
    });
    const props = lastProposals.slice();
    if (!ch.length && !props.length && !conf.length) return;
    try {
      if (typeof mostrarCargando === "function") mostrarCargando("Creando PDF...");
      await ensureExportLibs();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
      const W = 210, M = 15;
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      const from = document.getElementById("cpFrom").value, to = document.getElementById("cpTo").value;
      const cab = () => nvaPdfBand(pdf, logo, { kicker: "Club Nou Vòlei Alzira", title: "Cambios en el calendario", sub: from && to ? `Fechas consultadas: ${fmtDay(from)} - ${fmtDay(to)}` : "" });
      const seccion = (txt) => {
        pdf.setFillColor(214, 40, 57); pdf.rect(M, y - 3.6, 5, 1.2, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(27, 58, 140);
        pdf.text(txt.toUpperCase(), M + 7, y - 2.2, { charSpace: 0.4 });
        pdf.setDrawColor(227, 232, 244); pdf.line(M + 7 + pdf.getTextWidth(txt.toUpperCase()) + 8, y - 3, W - M, y - 3);
        pdf.setTextColor(13, 27, 69); y += 6;
      };
      let y = cab() + 12;
      seccion(`Cambios realizados${changesAll ? " (todos)" : ""}`);
      if (!ch.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text("Sin cambios.", M, y); y += 7; }
      ch.forEach((c, i) => {
        const lines = [c.vs].concat(c.items.map(t => "   " + t.replace("→", "->")));
        if (y + lines.length * 5.5 > 278) { pdf.addPage(); y = cab() + 12; }
        pdf.setFillColor(13, 27, 69); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(245, 197, 24);
        pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
        pdf.setFontSize(11); pdf.setTextColor(13, 27, 69);
        pdf.text(lines[0], M + 8, y); y += 5.5;
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
        lines.slice(1).forEach(l => { pdf.text(pdf.splitTextToSize(l.trim(), W - 2 * M - 8), M + 8, y); y += 5.5; });
        y += 2.5;
      });
      if (props.length) {
        if (y + 20 > 278) { pdf.addPage(); y = cab() + 12; }
        y += 4;
        seccion("Propuestas de partidos (sin hora oficial)");
        props.forEach((m, i) => {
          if (y + 11 > 278) { pdf.addPage(); y = cab() + 12; }
          pdf.setFillColor(245, 197, 24); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(13, 27, 69);
          pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
          pdf.setFontSize(11);
          pdf.text(`${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}`, M + 8, y); y += 5.5;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
          pdf.text(`Propuesta: ${whenTxt(m.date, toHHMM(m.start))}${isHome(m) ? " (local)" : " (visitante)"}`, M + 8, y); y += 7.5;
        });
      }
      if (conf.length) {
        if (y + 20 > 278) { pdf.addPage(); y = cab() + 12; }
        y += 4;
        seccion("Fechas confirmadas");
        conf.forEach((m, i) => {
          if (y + 11 > 278) { pdf.addPage(); y = cab() + 12; }
          pdf.setFillColor(31, 157, 85); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(255, 255, 255);
          pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
          pdf.setFontSize(11); pdf.setTextColor(13, 27, 69);
          pdf.text(`${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}`, M + 8, y); y += 5.5;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
          const lugar = isHome(m) ? " (local)" : " (visitante)";
          const ls = pdf.splitTextToSize(`${whenTxt(m.date, m.time)}${lugar}${m.venue ? " · " + m.venue.replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'") : ""}`, W - 2 * M - 8);
          pdf.text(ls, M + 8, y); y += 7.5 + (ls.length - 1) * 4.5;
        });
      }
      nvaPdfFooters(pdf);
      pdf.save(`Cambios_partidos_${isoDay(new Date())}.pdf`);
    } catch (e) {
      console.error(e);
      alert("No se pudo crear el PDF. La primera vez hace falta conexión para descargar el generador de PDF.");
    } finally {
      if (typeof ocultarCargando === "function") ocultarCargando();
    }
  };
  function dragTarget(x, y) {
    const tl = document.getElementById("cpTimeline");
    const under = document.elementsFromPoint(x, y).find(e => e.classList && e.classList.contains("cp-tl-row"));
    const row = under || drag.lastRow;
    if (!row) return null;
    drag.lastRow = row;
    const track = row.querySelector(".cp-tl-track");
    const r = track.getBoundingClientRect();
    const minH = +tl.dataset.minh, span = +tl.dataset.span;
    let start = minH * 60 + (x - drag.dx - r.left) / r.width * span;
    start = Math.round(start / 15) * 15;
    start = Math.max(minH * 60, Math.min(minH * 60 + span - DUR, start));
    return { row, track, day: row.dataset.day, start, left: (start - minH * 60) / span * 100 };
  }
  function cancelLongPress() { clearTimeout(drag.timer); drag.timer = null; }
  function onDown(e) {
    const el = e.target.closest(".cp-tl-blk");
    if (!el) return;
    cancelLongPress();
    drag.el = el; drag.x0 = e.clientX; drag.y0 = e.clientY;
    const r = el.getBoundingClientRect(); drag.dx = e.clientX - r.left;
    drag.timer = setTimeout(() => {
      drag.active = true; drag.timer = null;
      el.classList.add("dragging");
      document.body.classList.add("cp-dragging");
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (err) {}
    }, 400);
  }
  function onMove(e) {
    if (drag.timer && (Math.abs(e.clientX - drag.x0) > 8 || Math.abs(e.clientY - drag.y0) > 8)) cancelLongPress();
    if (!drag.active) return;
    e.preventDefault();
    const tg = dragTarget(e.clientX, e.clientY);
    if (!tg) return;
    if (drag.el.parentNode !== tg.track) tg.track.appendChild(drag.el);
    drag.el.style.left = tg.left + "%";
    drag.el.style.top = "2px";
    const lbl = drag.el.querySelector(".cp-tl-t"); if (lbl) lbl.textContent = toHHMM(tg.start);
    drag.target = tg;
  }
  function onUp() {
    cancelLongPress();
    if (!drag.active) { drag.el = null; return; }
    drag.active = false; drag.justDropped = true;
    setTimeout(() => { drag.justDropped = false; }, 400);
    document.body.classList.remove("cp-dragging");
    const mk = drag.el.getAttribute("data-mk"), tg = drag.target;
    drag.el = null; drag.target = null; drag.lastRow = null;
    if (mk && tg) { cp.moved = cp.moved || {}; cp.moved[mk] = { date: tg.day, start: tg.start }; saveMoves(); }
    renderMatches();
  }
  function initDrag() {
    const tl = document.getElementById("cpTimeline");
    if (!tl) return;
    tl.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", () => { cancelLongPress(); if (drag.active) onUp(); });
    tl.addEventListener("contextmenu", (e) => { if (e.target.closest(".cp-tl-blk")) e.preventDefault(); });
  }

  function renderTeams() {
    const box = document.getElementById("cpTeams");
    if (!box || box.closest(".collapsed")) return;
    const teams = (typeof appData !== "undefined" && appData.teams) || [];
    if (!teams.length) { box.innerHTML = `<div class="cp-empty">No hay equipos configurados.</div>`; return; }
    box.innerHTML = (autoMsg ? `<div class="cp-auto-msg">${esc(autoMsg)}</div>` : "") + teams.map((t, i) => {
      const key = getTeamKey(t);
      const info = cp.teams[key];
      let change = "";
      if (info && info.changeStatus === "sin") change = `<span class="cp-chg cp-chg-sin">Sin cambios desde ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}${info.checkedAt ? ` · revisado ${fmtDay(info.checkedAt.slice(0, 10))}` : ""}</span>`;
      else if (info && info.changeStatus === "con") change = `<span class="cp-chg cp-chg-con">Con cambios (${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}) <button type="button" class="cp-chg-btn" data-key="${esc(key)}" onclick="cpShowChanges(this)">🔍 Ver cambios</button></span>`;
      const status = info
        ? `<span class="wk-mark wk-v">V</span><span class="cp-up">${fmtDay(info.uploadedAt.slice(0, 10))} · ${(info.matches || []).length} partidos</span>${change}`
        : `<span class="cp-up cp-none">Sin PDF</span>`;
      const iden = (cp.idens || {})[key] || "";
      return `<div class="cp-team">
        <div class="cp-team-name">${esc(key)}<div class="cp-team-status">${status}</div></div>
        <label class="cp-iden"><span>Iden</span><input type="text" inputmode="numeric" maxlength="5" placeholder="0000" value="${esc(iden)}" data-key="${esc(key)}" onchange="cpSetIden(this)"></label>
        ${manualMode ? `<button class="cp-upload" onclick="cpPickPdf(${i})">📄 ${info ? "Cambiar" : "Subir"} PDF</button>` : ""}
      </div>`;
    }).join("") + `<div class="cp-auto-note">🕗 Se actualiza automáticamente cada día a las ${autoHour()}</div>
      <div class="cp-update-btns">
        <button type="button" class="btn-save-session cp-update-all" onclick="cpUpdateAll()">🔄 Actualizar automáticamente</button>
        <button type="button" class="btn-save-session cp-update-manual${manualMode ? " active" : ""}" aria-pressed="${manualMode}" onclick="cpToggleManual()">✋ Actualizar manualmente</button>
      </div>`;
  }

  // Botones de subir/cambiar PDF a mano: solo visibles tras pulsar «Actualizar manualmente»
  let manualMode = false;
  window.cpToggleManual = function () { manualMode = !manualMode; renderTeams(); };

  // Hora local de la actualización diaria de la tarea de GitHub (cron "0 6 * * *", en UTC)
  const AUTO_UTC_HOUR = 6;
  function autoHour() {
    const d = new Date(); d.setUTCHours(AUTO_UTC_HOUR, 0, 0, 0);
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  // Línea del resumen final: «- Equipo: x partidos» y debajo si hay cambios o no
  function fmtRes(key, res, extra) {
    const m = /^«.*», (\d+) partidos · (.+)$/.exec(res);
    if (!m) return `- ${key}: ${res}${extra || ""}`;
    const info = cp.teams[key] || {};
    let st = m[2] === "nuevo" ? "Nuevo (primera carga)" : m[2] === "con cambios" ? "Con cambios" : "Sin cambios";
    if (m[2] === "sin cambios" && (info.changedAt || info.uploadedAt)) st += ` desde ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}`;
    return `- ${key}: ${m[1]} partidos\n   ${st}${extra || ""}`;
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

  // Los equipos del club pueden aparecer como «NVA» o «Nou Volei Alzira»
  const isClubName = (n) => /\bNVA\b|NOU VOLE[IY]S? ALZIRA/.test(normalizeTeamName(n));
  function findFedName(lines, team) {
    const names = candidateNames(lines);
    const club = names.filter(isClubName);
    const wanted = [team.name, `${team.name} ${team.category}`];
    const sc = (n) => Math.max(...wanted.map(w => score(w, n)));
    let best = null;
    if (club.length === 1) best = club[0];
    else {
      const pool = (club.length ? club : names).map(n => ({ n, s: sc(n) })).sort((x, y) => y.s - x.s);
      if (pool.length && pool[0].s >= 0.99 && !(pool[1] && pool[1].s >= pool[0].s)) best = pool[0].n;
      else if (club.length && pool[0].s >= 0.5 && !(pool[1] && pool[1].s >= pool[0].s)) best = pool[0].n;
    }
    // Para preguntar: primero los del club
    return { best, names: club.concat(names.filter(n => !club.includes(n))) };
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
        c.replace(RE_DATE, "").replace(RE_TIME, "").split(/\s+-\s+(?=[A-Za-zÀ-ÿ0-9]{2,})/).forEach(p => { p = p.trim(); if (/[A-Za-zÀ-ÿ]{2,}/.test(p)) parts.push(p); });
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
      // Rival y pabellón pegados en la misma celda ("NOU ALGEMESÍ PAV. 9 OCTUBRE (ALGEMESÍ)")
      if (rival && !venue) {
        const vm = rival.match(/^(.+?)\s+((?:PAB|PAV|PABELL[OÓ]N|POLIDEPORTIVO|POLIESPORTIU|PALAU|PISTAS?|CAMPO|COMPLEJO|CIUTAT|ESTADI|CENTRO|CENTRE|COLEGIO|INSTITUTO|IES|CEIP)\b.*)$/i);
        if (vm && /[A-Za-zÀ-ÿ]{2,}/.test(vm[1])) { rival = vm[1].trim(); venue = vm[2].trim(); }
      }
      if (/DESCANS/i.test(rival) || /\bDESCANSA\b/i.test(l.text)) return;   // jornada de descanso
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
    const res = await processPdf(file, `${sanitizeFileName(key)}.pdf`, team, false);
    if (/(con cambios|nuevo)$/.test(res)) savePdfToGitHub(key, file);   // copia del PDF en Calendarios/<Equipo>.pdf
  }

  // Analiza un PDF y guarda los partidos del equipo. batch = actualización automática
  // (si el equipo se reconoce solo, no se pide confirmación). Devuelve un texto de resultado.
  async function processPdf(file, fileName, team, batch, fedHint, silent) {
    const key = getTeamKey(team);
    mostrarCargando(`Analizando el PDF de ${key}...`);
    let lines;
    try { lines = await pdfLines(file); }
    catch (e) {
      console.error(e); ocultarCargando();
      if (!batch) alert("No se pudo leer el PDF. La primera vez hace falta conexión para descargar el lector de PDF.");
      return "no se pudo leer el PDF";
    }
    ocultarCargando();

    const prev = cp.teams[key];
    let fed = fedHint || (prev && prev.fedName && lines.some(l => normalizeTeamName(l.text).includes(normalizeTeamName(prev.fedName))) ? prev.fedName : null);
    let asked = false;
    if (!fed) {
      const r = findFedName(lines, team);
      fed = r.best;
      if (!fed) {
        if (!r.names.length) { if (!batch) alert("No he encontrado partidos con fecha en este PDF."); return "sin partidos con fecha"; }
        if (silent) return "equipo no reconocido";
        const menu = r.names.slice(0, 40).map((n, i) => `${i + 1}. ${n}`).join("\n");
        const ans = prompt(`${key}: no sé cuál es en el PDF.\nEscribe el número del equipo que corresponde (vacío = saltar):\n\n${menu}`);
        const n = parseInt(ans, 10);
        if (!(n >= 1 && n <= Math.min(40, r.names.length))) return "saltado";
        fed = r.names[n - 1]; asked = true;
      }
    }
    const matches = extractMatches(lines, fed);
    if (!matches.length) { if (!batch) alert(`He encontrado "${fed}" pero ningún partido con fecha.`); return `«${fed}» sin partidos con fecha`; }
    // ¿Ha cambiado algo respecto a lo que ya había guardado?
    const same = prev && prev.fedName === fed && sameMatches(prev.matches, matches);
    if (same) {
      const now = new Date().toISOString();
      prev.changeStatus = "sin";
      migrarClaves(key, prev.matches, matches);
      prev.matches = matches;   // mismos partidos; se guarda el texto nuevo (p. ej. con los resultados)
      prev.changedAt = prev.changedAt || prev.uploadedAt;
      prev.checkedAt = now;
      cp.updated = now;
      saveLocal();
      render();
      if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
        await writeGitHubFile(CP_FILE, cp, `Calendario de partidos de ${key}: sin cambios`);
      }
      if (!batch) alert(`${key}: sin cambios desde el ${fmtDay(prev.changedAt.slice(0, 10))}. Se mantiene lo que había.`);
      return `«${fed}», ${matches.length} partidos · sin cambios`;
    }
    if (!batch && !asked && !confirm(`Equipo encontrado en el PDF: "${fed}"\n${matches.length} partidos (del ${fmtDay(matches[0].date)} al ${fmtDay(matches[matches.length - 1].date)}).\n\n¿Guardar para ${key}?`)) return "cancelado";

    const now = new Date().toISOString();
    cp.teams[key] = { fedName: fed, fileName, uploadedAt: now, matches, changeStatus: prev ? "con" : "nuevo", changedAt: now, checkedAt: now };
    if (prev) cp.teams[key].changes = diffMatches(prev.matches, matches);
    cp.updated = now;
    saveLocal();
    render();
    if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
      await writeGitHubFile(CP_FILE, cp, `Calendario de partidos de ${key}`);
    }
    return `«${fed}», ${matches.length} partidos · ${prev ? "con cambios" : "nuevo"}`;
  }

  // Detalle de los cambios. Solo cuentan los cambios de FECHA, HORA o CAMPO (pabellón);
  // otras diferencias del PDF (nombre del rival, resultados...) no son cambios.
  // Los partidos se emparejan por jornada y local/visitante, o por rival parecido.
  const nrm = (t) => normalizeTeamName(t || "");
  function rivalLike(a, b) {
    const x = nrm(a), y = nrm(b);
    if (!x || !y) return x === y;   // los dos sin rival (p. ej. partido aún sin rival asignado)
    return x === y || x.startsWith(y) || y.startsWith(x);
  }
  function venueChanged(o, n) {
    const ov = nrm(o.venue), nv = nrm(n.venue);
    if (!nv || ov === nv) return false;                 // sin campo en el PDF nuevo: no se considera cambio
    if (!ov && nrm(o.rival).includes(nv)) return false; // antes el campo venía pegado al nombre del rival
    return true;
  }
  function significantChange(o, n) {
    return o.date !== n.date || (o.time || "") !== (n.time || "") || venueChanged(o, n);
  }
  function pairMatches(oldList, newList) {
    const olds = (oldList || []).slice(), used = new Set(), pairs = [], adds = [];
    (newList || []).forEach(n => {
      let best = -1, bestScore = 0;
      olds.forEach((o, k) => {
        if (used.has(k) || !!o.home !== !!n.home) return;
        let sc = 0;
        if (o.jornada && n.jornada && String(o.jornada) === String(n.jornada)) sc += 4;
        if (rivalLike(o.rival, n.rival)) sc += 2;
        if (!sc) return;
        if (o.date === n.date) sc += 1;
        if (sc > bestScore) { bestScore = sc; best = k; }
      });
      if (best >= 0) { used.add(best); pairs.push([olds[best], n]); } else adds.push(n);
    });
    return { pairs, adds, dels: olds.filter((o, k) => !used.has(k)) };
  }
  function diffMatches(oldList, newList) {
    const slim = (m) => ({ date: m.date, time: m.time, rival: m.rival, home: !!m.home, venue: m.venue || "" });
    const r = pairMatches(oldList, newList), out = [];
    r.pairs.forEach(([o, n]) => { if (significantChange(o, n)) out.push({ type: "mod", before: slim(o), after: slim(n) }); });
    r.adds.forEach(n => out.push({ type: "add", after: slim(n) }));
    r.dels.forEach(o => out.push({ type: "del", before: slim(o) }));
    const d = (c) => (c.after || c.before).date + (c.after || c.before).time;
    return out.sort((a, b) => d(a).localeCompare(d(b)));
  }
  // Los «con cambios» guardados con la regla anterior se revisan con la regla nueva
  function revisarEstadosCambios() {
    let tocado = false;
    Object.values(cp.teams || {}).forEach(info => {
      if (info.changeStatus !== "con" || !Array.isArray(info.changes)) return;
      const ch = info.changes.filter(c => c.type !== "mod" || significantChange(c.before, c.after));
      if (ch.length === info.changes.length) return;
      info.changes = ch;
      if (!ch.length) info.changeStatus = "sin";
      tocado = true;
    });
    return tocado;
  }

  window.cpShowChanges = function (btn) {
    const key = btn.dataset.key, info = cp.teams[key];
    if (!info) return;
    const line = (m) => `${fmtDay(m.date)} ${m.time && m.time !== "00:00" ? m.time : "(sin hora)"} · ${m.home ? "🏠 vs" : "✈️ en"} ${esc(m.rival)}${m.venue ? `<br><small>${esc(m.venue)}</small>` : ""}`;
    const what = (a, b) => [a.date !== b.date && "fecha", a.time !== b.time && "hora", a.venue !== b.venue && "pabellón"].filter(Boolean).join(", ");
    const list = info.changes;
    const body = !list ? `<div class="cp-modal-txt">No hay detalle guardado de este cambio (se detectó antes de que la app guardara el detalle). La próxima vez que cambie se podrá ver aquí.</div>`
      : !list.length ? `<div class="cp-modal-txt">Solo han cambiado datos que no afectan a los partidos (por ejemplo, resultados).</div>`
      : `<div class="cp-chg-list">${list.map(c => c.type === "add" ? `<div class="cp-chg-item add"><b>➕ Nuevo</b><br>${line(c.after)}</div>`
          : c.type === "del" ? `<div class="cp-chg-item del"><b>➖ Ya no está</b><br>${line(c.before)}</div>`
          : `<div class="cp-chg-item mod"><b>✏️ Cambia ${what(c.before, c.after)}</b><br><s>${line(c.before)}</s><br>${line(c.after)}</div>`).join("")}</div>`;
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">Cambios · ${esc(key)}</div>
      <div class="cp-modal-txt"><small>Detectados el ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}</small></div>
      ${body}
      <button class="cp-modal-btn cp-modal-main">Cerrar</button>
    </div>`;
    o.addEventListener("click", (e) => { if (e.target === o || e.target.classList.contains("cp-modal-main")) o.remove(); });
    document.body.appendChild(o);
  };

  // ¿Son los mismos partidos? (sin cambios de fecha, hora ni campo)
  function sameMatches(a, b) {
    return diffMatches(a, b).length === 0;
  }
  // Si el PDF escribe distinto el rival o la jornada, los partidos movidos y los cambios
  // local/visitante del equipo siguen apuntando al mismo partido.
  function migrarClaves(key, oldList, newList) {
    pairMatches(oldList, newList).pairs.forEach(([o, n]) => {
      const a = moveKey(key, o), b = moveKey(key, n);
      if (a === b) return;
      [cp.moved, cp.homeOv].forEach(map => { if (map && a in map && !(b in map)) { map[b] = map[a]; delete map[a]; } });
    });
  }

  // ---------- Iden de cada equipo y actualización automática desde la federación ----------
  const FED_URL = (iden) => `https://fvbcv.com/exportar_competiciones.php?idens=${encodeURIComponent(iden)}`;
  window.cpSetIden = function (inp) {
    const key = inp.getAttribute("data-key");
    const v = inp.value.replace(/\D/g, "").slice(0, 5);
    inp.value = v;
    if (v && v.length < 4) { inp.classList.add("cp-iden-bad"); return; }
    inp.classList.remove("cp-iden-bad");
    cp.idens = cp.idens || {};
    if (v) cp.idens[key] = v; else delete cp.idens[key];
    saveMoves();
  };

  // Ventana para cuando el navegador no deja descargar el PDF directamente:
  // se abre el enlace, se descarga y se elige el archivo. Devuelve File | "skip" | "stop".
  function askManualPdf(key, iden, pos, total) {
    return new Promise(resolve => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box">
        <div class="cp-modal-title">Actualizar ${pos}/${total}: ${esc(key)}</div>
        <div class="cp-modal-txt">El navegador no permite descargar el PDF de la federación automáticamente.<br>1. Pulsa <b>Abrir enlace</b> y descarga el PDF (iden ${esc(iden)}).<br>2. Vuelve aquí y pulsa <b>Elegir PDF descargado</b>.</div>
        <a class="cp-modal-btn" href="${FED_URL(iden)}" target="_blank" rel="noopener">🔗 Abrir enlace</a>
        <button type="button" class="cp-modal-btn cp-modal-main">📄 Elegir PDF descargado</button>
        <div class="cp-modal-row"><button type="button" class="cp-modal-btn cp-modal-skip">Saltar este equipo</button><button type="button" class="cp-modal-btn cp-modal-stop">Parar</button></div>
        <input type="file" accept="application/pdf,.pdf" style="display:none"></div>`;
      document.body.appendChild(o);
      const inp = o.querySelector("input");
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-main").onclick = () => inp.click();
      inp.onchange = () => { if (inp.files && inp.files[0]) done(inp.files[0]); };
      o.querySelector(".cp-modal-skip").onclick = () => done("skip");
      o.querySelector(".cp-modal-stop").onclick = () => done("stop");
    });
  }

  // La web de la federación no permite descargas desde otras webs (CORS), así que se prueba
  // primero directo y, si el navegador lo bloquea, a través de pasarelas públicas que añaden
  // ese permiso. Se recuerda la última que funcionó para empezar por ella.
  const FED_ROUTES = [
    { name: "directo", url: (u) => u },
    { name: "corsproxy.io", url: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
    { name: "allorigins", url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: "codetabs", url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` }
  ];
  const ROUTE_KEY = "NVA_FED_ROUTE";
  async function fetchPdfFrom(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...head) !== "%PDF-") throw new Error("La respuesta no es un PDF");
      return blob;
    } finally { clearTimeout(timer); }
  }
  async function downloadFedPdf(iden) {
    let first = 0;
    try { first = Math.max(0, FED_ROUTES.findIndex(r => r.name === localStorage.getItem(ROUTE_KEY))); } catch (e) {}
    const order = FED_ROUTES.slice(first).concat(FED_ROUTES.slice(0, first));
    let lastErr = null;
    for (const r of order) {
      try {
        const blob = await fetchPdfFrom(r.url(FED_URL(iden)));
        try { localStorage.setItem(ROUTE_KEY, r.name); } catch (e) {}
        return blob;
      } catch (e) { console.warn(`Descarga por ${r.name} fallida:`, e); lastErr = e; }
    }
    throw lastErr || new Error("No se pudo descargar");
  }

  // Guarda el PDF en GitHub como Calendarios/<Equipo>.pdf (sobrescribe si ya existe)
  const PDF_FOLDER = "Calendarios";
  async function savePdfToGitHub(key, blob) {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !ghSettings.token) return false;
    const path = `${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${path}`;
    const headers = { "Authorization": `token ${ghSettings.token}` };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    try {
      let sha = "";
      const g = await fetch(url, { headers, cache: "no-store" });
      if (g.ok) sha = (await g.json()).sha;
      const put = await fetch(url, {
        method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(Object.assign({ message: `PDF de partidos de ${key}`, content: btoa(bin) }, sha ? { sha } : {}))
      });
      return put.ok;
    } catch (e) { console.error("No se pudo guardar el PDF en GitHub:", e); return false; }
  }

  // Busca al equipo dentro de un PDF ya leído: devuelve {fed, s} (s = parecido 0..1) o null
  function teamInLines(lines, team) {
    const prev = cp.teams[getTeamKey(team)];
    if (prev && prev.fedName && lines.some(l => normalizeTeamName(l.text).includes(normalizeTeamName(prev.fedName)))) return { fed: prev.fedName, s: 2 };
    const names = candidateNames(lines);
    const club = names.filter(isClubName);
    const wanted = [team.name, `${team.name} ${team.category}`];
    let best = null;
    (club.length ? club : names).forEach(n => {
      const s = Math.max(...wanted.map(w => score(w, n)));
      if (!best || s > best.s) best = { fed: n, s };
    });
    return best && best.s >= 0.5 ? best : null;
  }

  // Lanza la descarga del navegador (va a la carpeta Descargas). Como en el «Descargador masivo»:
  // la web de la federación no deja leer el archivo desde otra web, pero sí descargarlo.
  function browserDownload(url) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Ventana para elegir de una vez todos los PDF descargados. Devuelve File[] | null
  function askDownloadedPdfs(n) {
    return new Promise(resolve => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box">
        <div class="cp-modal-title">Elige los ${n} PDF descargados</div>
        <div class="cp-modal-txt">La federación no deja que la app lea sus PDF directamente, así que se han descargado en tu carpeta <b>Descargas</b>.<br>Pulsa el botón y <b>selecciónalos todos a la vez</b>: la app reconoce sola de qué equipo es cada uno.</div>
        <button type="button" class="cp-modal-btn cp-modal-main">📄 Elegir los PDF descargados</button>
        <div class="cp-modal-row"><button type="button" class="cp-modal-btn cp-modal-retry">🔁 Volver a descargar</button><button type="button" class="cp-modal-btn cp-modal-stop">Cancelar</button></div>
        <input type="file" accept="application/pdf,.pdf" multiple style="display:none"></div>`;
      document.body.appendChild(o);
      const inp = o.querySelector("input");
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-main").onclick = () => inp.click();
      inp.onchange = () => { if (inp.files && inp.files.length) done(Array.from(inp.files)); };
      o.querySelector(".cp-modal-retry").onclick = () => done("retry");
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
    });
  }

  async function saveTeamPdf(team, file, fedHint, results) {
    const key = getTeamKey(team);
    const fname = `${sanitizeFileName(key)}.pdf`;
    const res = await processPdf(file, fname, team, true, fedHint);
    let saved = "";
    if (/(con cambios|nuevo)$/.test(res)) {
      mostrarCargando(`Guardando ${fname}...`);
      saved = (await savePdfToGitHub(key, file)) ? "" : " (PDF no guardado en GitHub)";
      ocultarCargando();
    }
    results.push(fmtRes(key, res, saved));
  }

  // ---------- Descarga en el servidor (tarea automática de GitHub) ----------
  // La tarea .github/workflows/descargar-calendarios.yml del repositorio de datos baja los PDF
  // desde la federación (allí no hay bloqueo del navegador) y los deja en Calendarios/<Equipo>.pdf.
  // Para no necesitar permisos nuevos en el TOKEN, la app no «lanza» la tarea: solo escribe
  // Calendarios/solicitud.json (como cualquier otro dato) y la tarea arranca sola al verlo.
  // Cuando termina escribe Calendarios/estado.json con el mismo id.
  const WF_PATH = ".github/workflows/descargar-calendarios.yml";
  function ghApi(path, opts) {
    const headers = Object.assign({ "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github+json" }, (opts && opts.headers) || {});
    return fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}${path}`, Object.assign({ cache: "no-store" }, opts || {}, { headers }));
  }
  async function readServerState() {
    const r = await ghApi(`/contents/${PDF_FOLDER}/estado.json`, { headers: { "Accept": "application/vnd.github.raw" } });
    return r.ok ? r.json() : null;
  }
  let serverResults = {};
  async function runServerDownload(teams) {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !ghSettings.token) return "sin conexión con GitHub configurada";
    mostrarCargando("Pidiendo a GitHub que descargue los PDF...");
    try {
      const wf = await ghApi(`/contents/${WF_PATH}`);
      if (wf.status === 404) return "la tarea automática no está instalada en el repositorio";
      if (!wf.ok) return `GitHub respondió ${wf.status}`;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const idens = {};
      teams.forEach(t => { idens[getTeamKey(t)] = cp.idens[getTeamKey(t)]; });
      const ok = await writeGitHubFile(`${PDF_FOLDER}/solicitud.json`, { id, pedido: new Date().toISOString(), idens }, "Solicitar descarga de PDF de partidos");
      if (!ok) return "no se pudo escribir la solicitud en GitHub";
      // Esperar a que la tarea termine (máx. 5 min)
      for (let i = 0; i < 60; i++) {
        await wait(5000);
        mostrarCargando(`GitHub está descargando los PDF... (${(i + 1) * 5} s)`);
        let st = null;
        try { st = await readServerState(); } catch (e) {}
        if (st && st.id === id) { serverResults = st.resultados || {}; return ""; }
      }
      return "la tarea no respondió (¿está activada la pestaña Actions del repositorio?)";
    } catch (e) { console.error(e); return "error al hablar con GitHub"; }
    finally { ocultarCargando(); }
  }
  async function readServerPdf(key) {
    const r = await ghApi(`/contents/${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`, { headers: { "Accept": "application/vnd.github.raw" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") throw new Error("No es un PDF");
    return new File([blob], `${sanitizeFileName(key)}.pdf`, { type: "application/pdf" });
  }

  // ---------- Lectura automática al desplegar «Equipos · PDF Competición» ----------
  // Para cada equipo se mira la fecha del último cambio de su PDF en GitHub (Calendarios/<Equipo>.pdf).
  // Solo se lee el PDF si es posterior a la última revisión de ese equipo.
  const AUTO_SEEN = "NVA_CP_AUTO_SEEN";   // PDF ya intentados sin éxito (para no repetirlos cada vez)
  let autoChecking = false, autoMsg = "";
  function setAutoMsg(t) { autoMsg = t; renderTeams(); }
  async function pdfDateInGitHub(key) {
    const r = await ghApi(`/commits?path=${encodeURIComponent(`${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`)}&per_page=1`);
    if (!r.ok) return null;
    const list = await r.json();
    const c = list && list[0] && list[0].commit;
    return c ? (c.committer || c.author).date : null;
  }
  async function autoCheckPdfs() {
    if (autoChecking || updating) return;
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !ghSettings.token || !navigator.onLine) return;
    const teams = ((typeof appData !== "undefined" && appData.teams) || []).slice();
    if (!teams.length) return;
    autoChecking = true;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(AUTO_SEEN) || "{}") || {}; } catch (e) { seen = {}; }
    const done = [];
    try {
      await fetchFromGitHub();   // primero los datos más recientes, para comparar con la última revisión real
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i], key = getTeamKey(team);
        setAutoMsg(`🔄 Revisando los PDF de GitHub (${i + 1}/${teams.length})...`);
        let date = null;
        try { date = await pdfDateInGitHub(key); } catch (e) { console.warn(e); }
        if (!date) continue;
        const info = cp.teams[key];
        const last = info && (info.checkedAt || info.uploadedAt);
        if (last && new Date(date) <= new Date(last)) continue;   // ya revisado después de ese PDF
        if (seen[key] === date) continue;
        let file = null;
        try { file = await readServerPdf(key); } catch (e) { console.warn(`Sin PDF en GitHub para ${key}:`, e); }
        if (!file) continue;
        const res = await processPdf(file, file.name, team, true, null, true);
        if (/partidos · /.test(res)) { delete seen[key]; done.push(fmtRes(key, res)); }
        else { seen[key] = date; done.push(`- ${key}: ${res}`); }
      }
    } finally {
      autoChecking = false;
      ocultarCargando();
      try { localStorage.setItem(AUTO_SEEN, JSON.stringify(seen)); } catch (e) {}
    }
    const when = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setAutoMsg(done.length ? `✅ ${when} · ${done.length === 1 ? "leído 1 PDF nuevo" : `leídos ${done.length} PDF nuevos`} de GitHub` : `✅ ${when} · los PDF de GitHub no han cambiado desde la última revisión`);
  }

  let updating = false;
  window.cpUpdateAll = async function () {
    if (updating) return;
    const teams = ((typeof appData !== "undefined" && appData.teams) || []).filter(t => (cp.idens || {})[getTeamKey(t)]);
    if (!teams.length) { alert("Escribe primero el iden (4 o 5 dígitos) de algún equipo."); return; }
    if (!navigator.onLine) { alert("Sin conexión: no se pueden descargar los PDF ahora."); return; }
    updating = true;
    const results = [], pending = [];
    let autoOk = null;   // se prueba la descarga automática con el primer equipo
    try {
      // 0) Lo mejor: la tarea automática de GitHub descarga todos los PDF en el servidor
      const why = await runServerDownload(teams);
      let todo = teams;
      if (!why) {
        todo = [];
        for (let i = 0; i < teams.length; i++) {
          const team = teams[i], key = getTeamKey(team);
          mostrarCargando(`Leyendo ${i + 1}/${teams.length}: ${key}...`);
          let file = null;
          if (serverResults[key] && serverResults[key] !== "ok") { results.push(`(GitHub no pudo bajar ${key}: ${serverResults[key]})`); ocultarCargando(); todo.push(team); continue; }
          try { file = await readServerPdf(key); } catch (e) { console.warn(`Sin PDF en GitHub para ${key}:`, e); }
          ocultarCargando();
          if (!file) { todo.push(team); continue; }
          results.push(fmtRes(key, await processPdf(file, file.name, team, true)));
        }
      } else console.warn("Descarga en GitHub no disponible:", why);
      if (why && why !== "sin conexión con GitHub configurada") results.push(`(Descarga en GitHub no disponible: ${why})`);

      // 1) Descarga desde el navegador (directa o por pasarela), uno a uno
      for (let i = 0; i < todo.length; i++) {
        const team = todo[i], key = getTeamKey(team), iden = cp.idens[key];
        if (autoOk === false) { pending.push(team); continue; }
        mostrarCargando(`Descargando ${i + 1}/${todo.length}: ${key}...`);
        let file = null;
        try { file = await downloadFedPdf(iden); autoOk = true; }
        catch (e) { console.warn("Descarga automática no disponible:", e); if (autoOk === null) autoOk = false; }
        ocultarCargando();
        if (!file) { pending.push(team); continue; }
        await saveTeamPdf(team, file, null, results);
      }

      // 2) Lo que no se pudo leer: se descarga con el navegador (a Descargas) y se eligen todos de una vez
      while (pending.length) {
        for (let i = 0; i < pending.length; i++) {
          mostrarCargando(`Descargando en tu carpeta Descargas ${i + 1}/${pending.length}...`);
          browserDownload(FED_URL(cp.idens[getTeamKey(pending[i])]));
          await wait(1200);   // una a una, con pausa, para que el navegador no bloquee descargas seguidas
        }
        ocultarCargando();
        const files = await askDownloadedPdfs(pending.length);
        if (files === "retry") continue;
        if (!files) { pending.forEach(t => results.push(`- ${getTeamKey(t)}: cancelado`)); break; }

        mostrarCargando("Leyendo los PDF...");
        const parsed = [];
        for (const f of files) { try { parsed.push({ f, lines: await pdfLines(f) }); } catch (e) { console.warn(e); } }
        ocultarCargando();
        for (const team of pending) {   // a cada equipo, el PDF donde mejor aparece
          const key = getTeamKey(team);
          let best = null;
          parsed.forEach(p => { const m = teamInLines(p.lines, team); if (m && (!best || m.s > best.m.s)) best = { p, m }; });
          if (!best && parsed.length) {
            const menu = parsed.map((p, i) => `${i + 1}. ${p.f.name}`).join("\n");
            const ans = prompt(`${key}: no lo encuentro en ningún PDF.\nEscribe el número del PDF que es suyo (vacío = saltar):\n\n${menu}`);
            const n = parseInt(ans, 10);
            if (n >= 1 && n <= parsed.length) best = { p: parsed[n - 1], m: null };
          }
          if (!best) { results.push(`- ${key}: no encontrado en los PDF elegidos`); continue; }
          await saveTeamPdf(team, best.p.f, best.m ? best.m.fed : null, results);
        }
        break;
      }
    } finally {
      updating = false;
      ocultarCargando();
    }
    render();
    alert("Actualización terminada:\n\n" + results.join("\n\n"));
  };

  async function fetchFromGitHub() {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    if (typeof offlineQueue !== "undefined" && offlineQueue.some(op => op.fileName === CP_FILE)) return;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    try {
      const res = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${CP_FILE}`, { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = JSON.parse(b64_to_utf8((await res.json()).content));
      if (data && data.teams) { cp = data; revisarEstadosCambios(); saveLocal(); render(); }
    } catch (e) { console.error(`Error al cargar ${CP_FILE}:`, e); }
  }

  // Acceso para otras partes de la app (carga automática de carteles)
  window.cpGetData = () => cp;
  window.cpGetRange = () => ({ from: (document.getElementById("cpFrom") || {}).value || "", to: (document.getElementById("cpTo") || {}).value || "" });
  window.cpRefreshFromGitHub = () => autoCheckPdfs();

  function init() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (!from) return;
    // Por defecto: sábado y domingo de la semana siguiente a la actual
    const sat = new Date(); sat.setHours(12, 0, 0, 0);
    sat.setDate(sat.getDate() - ((sat.getDay() + 6) % 7) + 7 + 5);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    from.value = isoDay(sat); to.value = isoDay(sun);
    from.addEventListener("change", onFromChange);
    to.addEventListener("change", onToChange);
    updateRangeLabel();
    document.getElementById("cpFileInput").addEventListener("change", (e) => onFile(e.target));
    let open = false; try { open = localStorage.getItem(CP_OPEN) === "1"; } catch (e) {}
    initSubs();
    initDrag();
    setOpen(open);
    renderMatches();
    if (!(open && subState().teams)) fetchFromGitHub();   // si no, ya lo hace autoCheckPdfs
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
