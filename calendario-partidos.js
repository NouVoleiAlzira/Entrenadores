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
    // Propuestos que el usuario ha movido a mano: se respetan tal cual
    const moved = (cp.moved || {});
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
    if (open && id === "teams") renderTeams();
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
          const cls = ["cp-tl-blk", isHome(m) ? "home" : "away", m.placed ? "placed" : "", w ? "warn" : ""].join(" ");
          const tip = `${toHHMM(m.start)}${m.placed ? " (propuesta)" : ""} · ${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}${m.coaches.length ? " · " + m.coaches.join(", ") : ""}${w ? "\n⚠ " + w.map(x => x.text).join("\n⚠ ") : ""}`;
          t += `<div class="${cls}" style="left:${pct(m.start)};width:${pct(minH * 60 + DUR)};top:${m.lane * 34 + 2}px" title="${esc(tip)}" onclick="cpShowMatch(this)" data-tip="${esc(tip)}"${m.placed ? ` data-mk="${esc(m.mk)}" data-start="${m.start}"` : ""}>
            <span class="cp-tl-t">${w ? "⚠️" : ""}${toHHMM(m.start)}</span><span class="cp-tl-n">${esc(short(m.team))}</span></div>`;
        });
        t += `</div></div>`;
      });
      const nMoved = Object.keys(cp.moved || {}).length;
      t += `<div class="cp-tl-legend"><span><i class="cp-lg home"></i>Casa</span><span><i class="cp-lg away"></i>Fuera</span><span><i class="cp-lg placed"></i>Hora propuesta</span><span><i class="cp-lg warn"></i>Aviso</span></div>
        <div class="cp-tl-legend"><span class="cp-tl-hint">Toca un partido para ver el detalle. Mantén pulsado uno propuesto para moverlo (hora o día).</span>${nMoved ? `<button type="button" class="cp-tl-reset" onclick="cpResetMoves()">↺ Recolocar propuestos (${nMoved} movidos)</button>` : ""}</div>`;
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
  window.cpResetMoves = function () {
    if (!confirm("¿Volver a colocar automáticamente todos los partidos propuestos que has movido?")) return;
    cp.moved = {}; saveMoves(); renderMatches();
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
    const el = e.target.closest(".cp-tl-blk.placed");
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
    tl.addEventListener("contextmenu", (e) => { if (e.target.closest(".cp-tl-blk.placed")) e.preventDefault(); });
  }

  function renderTeams() {
    const box = document.getElementById("cpTeams");
    if (!box || box.closest(".collapsed")) return;
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
    fetchFromGitHub();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
