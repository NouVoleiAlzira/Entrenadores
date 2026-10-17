// =====================================================================
//  PDF PARTIDOS Y RESULTADOS: cuadrante local × visitante de la liga
//  de cada equipo, con la clasificación al lado.
//  Los datos salen del PDF de la federación (fvbcv.com) que la tarea de
//  GitHub deja en Calendarios/<Equipo>.pdf del repositorio de datos.
//  Funciona como «PDF Entrenamientos»: se activa el modo PDF y se elige
//  un equipo, todos los de un entrenador o todos los equipos.
// =====================================================================
(function () {
  const PDF_FOLDER = "Calendarios";
  let cuadranteMode = false;

  // ---------- Modo de selección (reutiliza el modo PDF de app.js) ----------
  const origToggle = window.togglePdfMode;
  const origOpenRange = window.openDateRangeModal;
  const origOpenBatch = window.openBatchDateRangeModal;

  function paintMode() {
    const banner = document.querySelector("#pdfModeBanner span");
    const bTrain = document.getElementById("btnPdfMode");
    const bCuad = document.getElementById("btnPdfCuadrante");
    if (banner) banner.textContent = cuadranteMode
      ? "📌 PDF Partidos y Resultados: selecciona Entrenador y Equipo"
      : "📌 Modo PDF Activo: Selecciona Entrenador y Equipo";
    if (bTrain) bTrain.style.opacity = isPdfMode && !cuadranteMode ? "0.6" : "1";
    if (bCuad) bCuad.style.opacity = isPdfMode && cuadranteMode ? "0.6" : "1";
  }

  window.togglePdfMode = function () {
    if (isPdfMode && cuadranteMode) { salir(); return; }   // «✕ Cancelar» o volver a pulsar
    origToggle.apply(this, arguments);
    if (!isPdfMode) cuadranteMode = false;
    paintMode();
  };

  window.togglePdfCuadranteMode = function () {
    if (isPdfMode && cuadranteMode) { salir(); return; }
    cuadranteMode = true;
    if (!isPdfMode) origToggle();
    paintMode();
  };

  function salir() { cuadranteMode = false; if (isPdfMode) origToggle(); paintMode(); }

  window.openDateRangeModal = function (coach, teamKey) {
    if (!cuadranteMode) return origOpenRange.apply(this, arguments);
    salir();
    generar([teamKey], sanitizeFileName(teamKey));
  };

  window.openBatchDateRangeModal = function (coach) {
    if (!cuadranteMode) return origOpenBatch.apply(this, arguments);
    const keys = [];
    (coach ? [coach] : appData.coaches).forEach(c => getCoachTeamEntries(c).forEach(e => {
      if (!keys.includes(e.teamKey)) keys.push(e.teamKey);
    }));
    if (!keys.length) { alert("No hay equipos asignados."); return; }
    salir();
    generar(keys, coach ? "Equipos_" + sanitizeFileName(coach.name) : "Todos_los_equipos");
  };

  // ---------- Lectura del PDF de la federación ----------
  async function leerPdfGitHub(key) {
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token) throw new Error("Sin conexión con GitHub configurada (Opciones > GitHub)");
    const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`, {
      cache: "no-store",
      headers: { "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github.raw" }
    });
    if (r.status === 404) throw new Error("no hay PDF de competición en GitHub");
    if (!r.ok) throw new Error("GitHub respondió " + r.status);
    return r.arrayBuffer();
  }

  async function lineasPdf(data) {
    await ensurePdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push({ x: it.transform[4], str: it.str.trim() });
      });
      lines.sort((a, b) => b.y - a.y);
      lines.forEach(l => out.push(l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(" ").replace(/\s+/g, " ").trim()));
    }
    return out;
  }

  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  // Devuelve { titulo, impreso, clasificacion: [...], partidos: [...] }
  function analizar(lines) {
    const res = { titulo: "", impreso: "", clasificacion: [], partidos: [] };
    let enClasif = false;
    lines.forEach(t => {
      if (!res.titulo && /LIGA|DIVISI|GRUPO|FASE/i.test(t) && !/FEDERACI/i.test(t)) res.titulo = t;
      const imp = t.match(/impresi[oó]n:\s*(.+)$/i); if (imp) res.impreso = imp[1];
      if (/^CLASIFICACI[OÓ]N$/i.test(t)) { enClasif = true; return; }
      if (enClasif) {
        const m = t.match(/^(\d+)\s+(.+?)((?:\s+-?\d+){11})$/);
        if (!m) return;
        const n = m[3].trim().split(/\s+/).map(Number);
        res.clasificacion.push({ pos: +m[1], nombre: m[2].trim(), pj: n[0], pg: n[1] + n[2], pp: n[3] + n[4], sf: n[6], sc: n[7], pts: n[10] });
      }
    });
    const nombres = res.clasificacion.map(c => c.nombre);
    if (!nombres.includes("DESCANSA")) nombres.push("DESCANSA");
    nombres.sort((a, b) => b.length - a.length);
    const prefijo = (s) => { for (const n of nombres) { const m = s.match(new RegExp("^" + reEsc(n) + "(?:\\s+|$)")); if (m) return { n, rest: s.slice(m[0].length) }; } return null; };
    lines.forEach(t => {
      const m = t.match(/^(\d{1,2})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2})\s+(.*)$/);
      if (!m) return;
      const loc = prefijo(m[6]); if (!loc) return;
      const r = loc.rest.match(/^(?:(\d)\s*-\s*(\d)(?:\s*\(([^)]*)\))?|-)(?:\s+|$)/); if (!r) return;
      const vis = prefijo(loc.rest.slice(r[0].length)); if (!vis) return;
      if (loc.n === "DESCANSA" || vis.n === "DESCANSA") return;
      res.partidos.push({
        jornada: +m[1], fecha: `${m[4]}-${m[3]}-${m[2]}`, hora: m[5], local: loc.n, visitante: vis.n,
        resultado: r[1] != null ? `${r[1]} - ${r[2]}` : "", sets: r[3] ? r[3].replace(/\s+/g, "") : ""
      });
    });
    return res;
  }

  const esClub = (n) => /\bNVA\b|NOU VOLE[IY]S? ALZIRA/.test(normalizeTeamName(n));
  function equipoPropio(key, nombres) {
    const cp = window.cpGetData ? window.cpGetData() : null;
    const fed = cp && cp.teams && cp.teams[key] && cp.teams[key].fedName;
    if (fed) { const f = nombres.find(n => normalizeTeamName(n) === normalizeTeamName(fed)) || nombres.find(n => normalizeTeamName(n).includes(normalizeTeamName(fed))); if (f) return f; }
    const club = nombres.filter(esClub);
    if (club.length <= 1) return club[0] || "";
    const t = appData.teams.find(x => getTeamKey(x) === key);
    const pal = normalizeTeamName(t ? t.name : key).split(" ").filter(w => w.length > 1 && w !== "NVA");
    return club.map(n => ({ n, s: pal.filter(w => (" " + normalizeTeamName(n) + " ").includes(" " + w + " ")).length }))
      .sort((a, b) => b.s - a.s)[0].n;
  }

  // ---------- Dibujo con jsPDF (A4 apaisado, una página por equipo) ----------
  const C = {
    gris: [27, 58, 140], grisOsc: [90, 90, 90], borde: [190, 199, 220], azul: [27, 58, 140], gris2: [160, 168, 184],
    rojo: [214, 40, 57], propio: [245, 197, 24], propioCel: [254, 245, 205], club: [190, 210, 250], clubCel: [234, 241, 254],
    noche: [13, 27, 69], diag: [226, 231, 243]
  };
  const fmtFecha = (iso) => { const [y, m, d] = iso.split("-"); return `${+d}-${+m}-${y.slice(2)}`; };

  function encajar(pdf, txt, ancho, tam, min) {
    let s = tam; pdf.setFontSize(s);
    while (s > min && pdf.getTextWidth(txt) > ancho) { s -= 0.25; pdf.setFontSize(s); }
    if (pdf.getTextWidth(txt) <= ancho) return txt;
    while (txt.length > 3 && pdf.getTextWidth(txt + "…") > ancho) txt = txt.slice(0, -1);
    return txt + "…";
  }

  function dibujar(pdf, key, d, logo) {
    const W = 297, H = 210, M = 7;
    const propio = equipoPropio(key, d.clasificacion.map(c => c.nombre));
    const equipos = d.clasificacion.map(c => c.nombre).filter(n => n !== "DESCANSA");
    d.partidos.forEach(p => [p.local, p.visitante].forEach(n => { if (!equipos.includes(n)) equipos.push(n); }));
    const n = equipos.length;
    const t = appData.teams.find(x => getTeamKey(x) === key);
    const cat = ((d.titulo.match(/ALEV[IÍ]N|INFANTIL|CADETE|JUVENIL|J[UÚ]NIOR|SENIOR|S[EÉ]NIOR/i) || [])[0] || (t ? t.category : "")).toUpperCase();

    // Cabecera
    const yBand = typeof nvaPdfBand === "function"
      ? nvaPdfBand(pdf, logo, { kicker: "Club Nou Vòlei Alzira · Partidos y resultados", title: key, sub: `${d.titulo}${d.impreso ? "   ·   Datos fvbcv.com del " + d.impreso : ""}`, h: 20 })
      : M + 10;

    // Cuadrante
    const x0 = M, y0 = yBand + 4, anchoGrid = 205;
    const cab = 30, cabX = 32;
    const cw = (anchoGrid - cabX) / n;
    const ch = Math.min(15, (H - 12 - y0 - cab) / n);
    const fondo = (nom, cel) => nom === propio ? (cel ? C.propioCel : C.propio) : esClub(nom) ? (cel ? C.clubCel : C.club) : null;
    pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.15);

    // Esquina con diagonal
    pdf.setFillColor(...C.noche); pdf.rect(x0, y0, cabX, cab, "FD");
    pdf.setDrawColor(255); pdf.line(x0, y0, x0 + cabX, y0 + cab); pdf.setDrawColor(...C.borde);
    pdf.setTextColor(245, 197, 24); pdf.setFont("helvetica", "bold");
    pdf.text(encajar(pdf, cat || "LIGA", cabX - 3, 12, 6), x0 + 1.5, y0 + 6);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(233, 238, 250);
    const ang = Math.atan(cab / cabX) * 180 / Math.PI;
    pdf.text("VISITANTE", x0 + cabX * 0.55, y0 + cab * 0.42, { angle: -ang });
    pdf.text("LOCAL", x0 + cabX * 0.30, y0 + cab * 0.62, { angle: -ang });

    equipos.forEach((nom, i) => {
      // Columna (visitante): nombre girado
      const cx = x0 + cabX + i * cw;
      pdf.setFillColor(...(fondo(nom) || C.gris)); pdf.rect(cx, y0, cw, cab, "FD");
      pdf.setFont("helvetica", "bold"); pdf.setTextColor(fondo(nom) ? 0 : 255);
      const tc = encajar(pdf, nom, cab - 3, 6.5, 4);
      pdf.text(tc, cx + cw / 2 + pdf.getFontSize() * 0.12, y0 + cab - 1.5, { angle: 90 });
      // Fila (local)
      const ry = y0 + cab + i * ch;
      pdf.setFillColor(...(fondo(nom) || C.gris)); pdf.rect(x0, ry, cabX, ch, "FD");
      const tf = encajar(pdf, nom, cabX - 2, 6.5, 4);
      pdf.text(tf, x0 + cabX - 1, ry + ch / 2 + 1, { align: "right" });
    });

    equipos.forEach((loc, i) => equipos.forEach((vis, j) => {
      const cx = x0 + cabX + j * cw, ry = y0 + cab + i * ch;
      if (i === j) { pdf.setFillColor(...C.diag); pdf.rect(cx, ry, cw, ch, "FD"); return; }
      const bg = (loc === propio || vis === propio) ? C.propioCel : (esClub(loc) || esClub(vis)) ? C.clubCel : [255, 255, 255];
      pdf.setFillColor(...bg); pdf.rect(cx, ry, cw, ch, "FD");
      const ps = d.partidos.filter(p => p.local === loc && p.visitante === vis);
      const p = ps.find(x => x.resultado) || ps[0];
      if (!p) return;
      const jugado = !!p.resultado, sinHora = p.hora === "00:00";
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.5); pdf.setTextColor(...(jugado ? C.azul : C.gris2));
      pdf.text(`Jorn. ${p.jornada}`, cx + 0.8, ry + 2.3);
      pdf.setFontSize(4.3); pdf.setTextColor(...(sinHora && !jugado ? C.rojo : jugado ? C.azul : C.gris2));
      pdf.text(`${fmtFecha(p.fecha)}${sinHora ? "" : " " + p.hora}`, cx + cw - 0.6, ry + 4.4, { align: "right" });
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(Math.min(10, ch * 0.75));
      pdf.setTextColor(...(jugado ? C.azul : C.gris2));
      pdf.text(jugado ? p.resultado : "-", cx + cw / 2, ry + ch * 0.66, { align: "center" });
      if (p.sets) {
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(...C.azul);
        pdf.text(encajar(pdf, `(${p.sets})`, cw - 1, 3.6, 2.5), cx + cw / 2, ry + ch - 0.9, { align: "center" });
      }
    }));
    pdf.setDrawColor(...C.noche); pdf.setLineWidth(0.5); pdf.rect(x0, y0, anchoGrid, cab + n * ch);
    pdf.line(x0 + cabX, y0, x0 + cabX, y0 + cab + n * ch); pdf.line(x0, y0 + cab, x0 + anchoGrid, y0 + cab);

    // Clasificación
    const tx = x0 + anchoGrid + 5, tw = W - M - tx;
    const cols = [["", 6], ["Equipo", 0], ["PJ", 6], ["PG", 6], ["PP", 6], ["SF", 6], ["SC", 6], ["PTS", 8]];
    cols[1][1] = tw - cols.reduce((s, c) => s + c[1], 0);
    const rh = 6.5;
    let y = y0;
    pdf.setLineWidth(0.15);
    pdf.setFillColor(...C.noche); pdf.rect(tx, y, tw, rh, "F"); pdf.setFillColor(245, 197, 24); pdf.rect(tx, y + rh - 0.6, tw, 0.6, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(255);
    let cx = tx;
    cols.forEach(([h, w], k) => { pdf.text(k === 1 ? "CLASIFICACIÓN" : h, k === 1 ? cx + 1 : cx + w / 2, y + 4.4, { align: k === 1 ? "left" : "center" }); cx += w; });
    y += rh;
    d.clasificacion.filter(c => c.nombre !== "DESCANSA").forEach((c, k) => {
      const bg = (fondo(c.nombre) && fondo(c.nombre, true)) || (k % 2 ? [246, 248, 253] : [255, 255, 255]);
      pdf.setFillColor(...bg); pdf.rect(tx, y, tw, rh, "F");
      pdf.setDrawColor(227, 232, 244); pdf.line(tx, y + rh, tx + tw, y + rh);
      const vals = [`${k + 1}º`, c.nombre, c.pj, c.pg, c.pp, c.sf, c.sc, c.pts];
      cx = tx; pdf.setTextColor(0);
      vals.forEach((v, q) => {
        const w = cols[q][1];
        pdf.setFont("helvetica", q === 1 || q === 7 ? "bold" : "normal");
        if (q === 1) pdf.text(encajar(pdf, String(v), w - 2, 6.5, 4.5), cx + 1, y + 4.4);
        else { pdf.setFontSize(q === 7 ? 8 : 6.5); pdf.text(String(v), cx + w / 2, y + 4.4, { align: "center" }); }
        cx += w;
      });
      y += rh;
    });
    pdf.setDrawColor(...C.borde);

    // Leyenda
    y += 6; pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(80);
    [["Filas: equipo local · Columnas: equipo visitante", null], ["Nuestro equipo", C.propio], ["Otros equipos del club", C.club]].forEach(([txt, col]) => {
      if (col) { pdf.setFillColor(...col); pdf.rect(tx, y - 2.6, 4, 3, "F"); }
      pdf.text(txt, tx + (col ? 5.5 : 0), y); y += 4.5;
    });
    pdf.setTextColor(...C.rojo); pdf.text("Fecha en rojo: partido aún sin hora", tx, y); y += 4.5;
    pdf.setTextColor(...C.gris2); pdf.text("Gris: partido pendiente", tx, y);
  }

  async function generar(keys, nombreArchivo) {
    mostrarCargando("Leyendo los PDF de la federación...");
    const fallos = [];
    try {
      await ensureExportLibs();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      let paginas = 0;
      for (const key of keys) {
        mostrarCargando(`Preparando ${key}...`);
        try {
          const d = analizar(await lineasPdf(await leerPdfGitHub(key)));
          if (!d.partidos.length) throw new Error("no se encontraron partidos en el PDF");
          if (paginas) pdf.addPage();
          dibujar(pdf, key, d, logo);
          paginas++;
        } catch (e) { console.warn(key, e); fallos.push(`- ${key}: ${e.message}`); }
      }
      if (paginas) { if (typeof nvaPdfFooters === "function") nvaPdfFooters(pdf); const nombre = `Partidos_y_Resultados_${nombreArchivo}.pdf`;
        pdf.save(nombre);   // la ventana de compartir sale sola (ver más abajo)
      }
      if (fallos.length) alert((paginas ? "Algunos equipos no se han incluido:\n" : "No se pudo generar el PDF:\n") + fallos.join("\n"));
    } catch (e) {
      console.error(e);
      alert("Ocurrió un error al generar el PDF de partidos y resultados.");
    } finally { ocultarCargando(); }
  }

  // ---------- Enviar el PDF por WhatsApp ----------
  // Se abre el menú «Compartir» del sistema con el PDF: se elige WhatsApp y el chat.
  // Sale en TODOS los PDF de la app: se envuelve jsPDF.save en cuanto jsPDF se carga.
  function ventanaWhatsApp(file) {
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box">
      <div class="cp-modal-title">📲 Enviar por WhatsApp</div>
      <div class="cp-modal-txt">PDF descargado. Pulsa <b>Compartir PDF</b>, elige <b>WhatsApp</b> y después el chat o grupo.</div>
      <div class="cp-modal-row">
        <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
        <button class="cp-modal-btn cp-modal-main wa-share">📤 Compartir PDF</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    o.querySelector(".wa-share").onclick = async () => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: file.name, text: file.name.replace(/\.pdf$/i, "").replace(/_/g, " ") }); o.remove(); }
        catch (e) { if (e.name !== "AbortError") alert("No se pudo compartir: " + e.message); }
      } else {
        alert("Este navegador no deja compartir archivos directamente.\nEl PDF ya está en Descargas: abre WhatsApp y adjúntalo con el clip 📎.");
        o.remove();
      }
    };
    o.querySelector(".cp-modal-stop").onclick = () => o.remove();
  }

  function engancharJsPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J || J.API.__nvaShare) return;
    // OJO: jsPDF crea «save» dentro de cada documento y luego copia encima lo de
    // jsPDF.API, así que aquí no hay «save» original que llamar: se descarga a mano.
    J.API.save = function (nombre, opciones) {
      const n = String(nombre || "documento.pdf").replace(/\.pdf$/i, "") + ".pdf";
      const blob = this.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = n; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      try { setTimeout(() => ventanaWhatsApp(new File([blob], n, { type: "application/pdf" })), 300); }
      catch (e) { console.warn("Compartir PDF:", e); }
      return opciones && opciones.returnPromise ? Promise.resolve(this) : this;
    };
    J.API.__nvaShare = true;
  }
  if (typeof loadScriptOnce === "function") {
    const origLoad = window.loadScriptOnce;
    window.loadScriptOnce = function () { return Promise.resolve(origLoad.apply(this, arguments)).then(v => { engancharJsPdf(); return v; }); };
  }
  engancharJsPdf();

  window.nvaCuadrante = { analizar, dibujar, generar };
})();
