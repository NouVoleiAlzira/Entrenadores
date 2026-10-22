// =====================================================================
//  REPORTE KILOMETRAJE: partidos de los equipos de un entrenador en un
//  mes, con los km de cada desplazamiento y el total, y PDF del informe.
//  Distancias: Matriz_Distancias_Campos.xlsx (copiada aquí abajo).
//  Partidos: los del calendario (calendario-partidos.js -> cpGetData()).
//  Salida y vuelta: Palau d'Esports (Alzira), salvo que se cambie la salida.
//  La flecha ⬇ de un partido lo encadena con el siguiente: se va de un
//  campo al otro sin pasar por casa.
// =====================================================================
(function () {
  let CAMPOS = ["Pab. El Raval (Gandía)", "Pab. Usos Múltiples (Gandía)", "Pab. Mun. Real de Gandía", "Pav. 9 d'Octubre (Algemesí)", "Col. Santa Ana (Algemesí)", "Palau d'Esports (Alzira)", "Pab. Ricardo Tormo (Canals)", "Pab. Mun. Cullera", "Pab. Mun. Ontinyent", "Pista al aire libre (La Pobla del Duc)", "Pab. CP S. Ignacio (Picassent)", "Gimnasio Polid. Mun. Picassent", "Pab. Mun. Sedaví", "Pab. Pablo Herrera (Castellón)", "Pab. Polid. La Cañada (Paterna)", "Resort Mas Camarena (Bétera)", "Pab. Mun. Vinaròs", "C.E. Toll L'Alberca (Torrent)", "Pab. Nou Moles (Valencia)", "Pab. Benicalap Sur (Valencia)", "Pav. Colegio Larrodé (Catarroja)", "Pistas Naranjas (Paterna)", "Pab. de la Fuensanta (Valencia)", "C.E. Cheste", "Pab. Georgina Blanes (UPV Alcoy)", "IES Albal", "Pab. Mun. Requena", "P.M. Benifaió", "Pab. Voleibol (Xàtiva)", "IES Cid Campeador (Valencia)", "Meta Club Deportivo (Massanassa)"];
  let DIST = [[0, 0.4, 2.2, 39.7, 39.6, 36.5, 44, 28.5, 49.8, 32.7, 67.7, 67.5, 72.7, 154, 91.7, 93.5, 238.2, 77.8, 79.6, 82.7, 70.1, 86.1, 78.2, 96.3, 48.1, 72.5, 132.5, 46, 37.1, 79.1, 71.2], [0.4, 0, 1.9, 39.6, 39.6, 36.5, 44.2, 28.3, 54.2, 33, 67.5, 67.3, 72.4, 153.7, 91.6, 93.3, 237.9, 77.6, 79.4, 82.5, 69.9, 85.9, 78, 96.2, 48.5, 72.3, 132.5, 45.9, 37.3, 78.9, 71], [2.2, 1.9, 0, 40.2, 40.1, 37.3, 45.9, 28.1, 56.2, 34.9, 67.8, 67.6, 72.4, 152.8, 91.6, 93.3, 236.6, 77.8, 79.3, 82.4, 70, 85.8, 77.9, 96.6, 54.2, 72.4, 133.6, 46.4, 39, 78.7, 71], [39.7, 39.6, 40.2, 0, 0.4, 6.4, 35.3, 18, 59.9, 42.7, 24.4, 24.2, 32.7, 126.9, 47.8, 54.7, 217.4, 34.5, 38.4, 41.9, 29.2, 43.6, 37.7, 49.6, 73.3, 31, 91.9, 6.3, 30.6, 39.8, 30.5], [39.6, 39.6, 40.1, 0.4, 0, 6.1, 34.9, 18.2, 59.5, 42.4, 24.6, 24.5, 33, 127.2, 48, 55, 217.8, 34.7, 38.6, 42.2, 29.5, 43.9, 38, 49.7, 73, 31.3, 91.8, 6.5, 30.2, 40.1, 30.8], [36.5, 36.5, 37.3, 6.4, 6.1, 0, 29.2, 19.8, 49.1, 36.4, 30.1, 29.9, 39, 133.8, 57.8, 61.1, 224.2, 40.3, 44.5, 48.1, 35.4, 49.6, 44, 58.2, 66.6, 37.1, 93.5, 11.7, 24.2, 46.2, 36.7], [44, 44.2, 45.9, 35.3, 34.9, 29.2, 0, 45.2, 21.9, 18.4, 59.4, 59.3, 71.2, 164.1, 83.4, 87.9, 255.3, 69.9, 76.3, 80.3, 67, 80.7, 76.2, 77.5, 40.1, 68.4, 96.9, 38.7, 7.2, 79.1, 68.4], [28.5, 28.3, 28.1, 18, 18.2, 19.8, 45.2, 0, 66.4, 45.5, 35.8, 35.7, 38.9, 125.6, 61.5, 63, 212.8, 44.5, 45.4, 48.2, 36.9, 55.6, 44, 68.4, 74, 39.1, 110.6, 22.6, 38.7, 44.8, 37.8], [49.8, 54.2, 56.2, 59.9, 59.5, 49.1, 21.9, 66.4, 0, 17.4, 82.8, 82.7, 94.2, 186.7, 107, 111.4, 277.1, 93.4, 99.5, 103.5, 90, 104.2, 99.3, 100.9, 21.5, 91.6, 115.5, 64.4, 24.9, 102.1, 91.5], [32.7, 33, 34.9, 42.7, 42.4, 36.4, 18.4, 45.5, 17.4, 0, 71.3, 71.2, 81.4, 172.3, 96.4, 100.1, 261.4, 82.3, 87.4, 91.2, 77.5, 92.7, 86.8, 93.5, 25.3, 79.3, 116.5, 47.9, 15.6, 89.2, 78.9], [67.7, 67.5, 67.8, 24.4, 24.6, 30.1, 59.4, 35.8, 82.8, 71.3, 0, 0.2, 12.3, 105.7, 23.4, 26.7, 198.1, 10.2, 15.7, 19.4, 8.3, 19.9, 16, 27.7, 98.6, 8.7, 76.7, 18.4, 56.3, 19.1, 9.5], [67.5, 67.3, 67.6, 24.2, 24.5, 29.9, 59.3, 35.7, 82.7, 71.2, 0.2, 0, 12.3, 105.7, 23.6, 26.9, 198.2, 10.3, 15.8, 19.5, 8.3, 20, 16, 27.8, 98.5, 8.8, 76.8, 18.2, 56.2, 19.1, 9.5], [72.7, 72.4, 72.4, 32.7, 33, 39, 71.2, 38.9, 94.2, 81.4, 12.3, 12.3, 0, 93.1, 18.6, 19.4, 185.2, 9.4, 6.5, 9.4, 4.1, 12.6, 5.2, 30.9, 108.6, 4.1, 84.1, 27.7, 67.4, 7.3, 2.8], [154, 153.7, 152.8, 126.9, 127.2, 133.8, 164.1, 125.6, 186.7, 172.3, 105.7, 105.7, 93.1, 0, 86.2, 80.3, 93.4, 96.5, 88.8, 84.8, 97.4, 85.9, 88.4, 102.7, 198.9, 96.3, 143.8, 122.4, 159.8, 85.2, 95.9], [91.7, 91.6, 91.6, 47.8, 48, 57.8, 83.4, 61.5, 107, 96.4, 23.4, 23.6, 18.6, 86.2, 0, 5.6, 179.5, 13.3, 12.4, 11.4, 20.1, 6.5, 14.4, 18.4, 123.7, 17.8, 71.1, 41.8, 81, 15.8, 19.3], [93.5, 93.3, 93.3, 54.7, 55, 61.1, 87.9, 63, 111.4, 100.1, 26.7, 26.9, 19.4, 80.3, 5.6, 0, 173.7, 16.7, 12.9, 10.4, 21.8, 7, 14.4, 23.7, 127.5, 19.8, 76.3, 44.9, 85.1, 14.5, 20.7], [238.2, 237.9, 236.6, 217.4, 217.8, 224.2, 255.3, 212.8, 277.1, 261.4, 198.1, 198.2, 185.2, 93.4, 179.5, 173.7, 0, 189.4, 181.5, 177.6, 189.6, 179, 180.9, 195.8, 286.8, 188.7, 233.6, 213.6, 250.3, 177.5, 188.1], [77.8, 77.6, 77.8, 34.5, 34.7, 40.3, 69.9, 44.5, 93.4, 82.3, 10.2, 10.3, 9.4, 96.5, 13.3, 16.7, 189.4, 0, 7.9, 11.1, 8.4, 10.1, 9.4, 21.6, 109.6, 6.3, 73.9, 28.5, 67.1, 12.9, 8.3], [79.6, 79.4, 79.3, 38.4, 38.6, 44.5, 76.3, 45.4, 99.5, 87.4, 15.7, 15.8, 6.5, 88.8, 12.4, 12.9, 181.5, 7.9, 0, 3.7, 9.2, 6.2, 2.2, 26.9, 114.7, 7.4, 80.6, 33, 72.9, 5.2, 8], [82.7, 82.5, 82.4, 41.9, 42.2, 48.1, 80.3, 48.2, 103.5, 91.2, 19.4, 19.5, 9.4, 84.8, 11.4, 10.4, 177.6, 11.1, 3.7, 0, 12.7, 5, 4.2, 27.9, 118.5, 11.1, 81.9, 36.6, 76.9, 4.4, 11.4], [70.1, 69.9, 70, 29.2, 29.5, 35.4, 67, 36.9, 90, 77.5, 8.3, 8.3, 4.1, 97.4, 20.1, 21.8, 189.6, 8.4, 9.2, 12.7, 0, 14.8, 8.6, 29.9, 104.8, 2.3, 82.1, 23.9, 63.3, 11.3, 1.4], [86.1, 85.9, 85.8, 43.6, 43.9, 49.6, 80.7, 55.6, 104.2, 92.7, 19.9, 20, 12.6, 85.9, 6.5, 7, 179, 10.1, 6.2, 5, 14.8, 0, 8, 23.2, 120, 12.8, 76.8, 37.9, 77.8, 9.4, 13.8], [78.2, 78, 77.9, 37.7, 38, 44, 76.2, 44, 99.3, 86.8, 16, 16, 5.2, 88.4, 14.4, 14.4, 180.9, 9.4, 2.2, 4.2, 8.6, 8, 0, 29, 114.1, 7.3, 82.8, 32.6, 72.6, 3.5, 7.3], [96.3, 96.2, 96.6, 49.6, 49.7, 58.2, 77.5, 68.4, 100.9, 93.5, 27.7, 27.8, 30.9, 102.7, 18.4, 23.7, 195.8, 21.6, 26.9, 27.9, 29.9, 23.2, 29, 0, 120.1, 27.9, 48, 43.2, 77, 31.7, 29.9], [48.1, 48.5, 54.2, 73.3, 73, 66.6, 40.1, 74, 21.5, 25.3, 98.6, 98.5, 108.6, 198.9, 123.7, 127.5, 286.8, 109.6, 114.7, 118.5, 104.8, 120, 114.1, 120.1, 0, 106.7, 138.4, 79.1, 40, 116.4, 106.2], [72.5, 72.3, 72.4, 31, 31.3, 37.1, 68.4, 39.1, 91.6, 79.3, 8.7, 8.8, 4.1, 96.3, 17.8, 19.8, 188.7, 6.3, 7.4, 11.1, 2.3, 12.8, 7.3, 27.9, 106.7, 0, 80.3, 25.5, 64.9, 10.4, 2], [132.5, 132.5, 133.6, 91.9, 91.8, 93.5, 96.9, 110.6, 115.5, 116.5, 76.7, 76.8, 84.1, 143.8, 71.1, 76.3, 233.6, 73.9, 80.6, 81.9, 82.1, 76.8, 82.8, 48, 138.4, 80.3, 0, 86.2, 100.4, 86, 82.4], [46, 45.9, 46.4, 6.3, 6.5, 11.7, 38.7, 22.6, 64.4, 47.9, 18.4, 18.2, 27.7, 122.4, 41.8, 44.9, 213.6, 28.5, 33, 36.6, 23.9, 37.9, 32.6, 43.2, 79.1, 25.5, 86.2, 0, 34.8, 34.9, 25.2], [37.1, 37.3, 39, 30.6, 30.2, 24.2, 7.2, 38.7, 24.9, 15.6, 56.3, 56.2, 67.4, 159.8, 81, 85.1, 250.3, 67.1, 72.9, 76.9, 63.3, 77.8, 72.6, 77, 40, 64.9, 100.4, 34.8, 0, 75.3, 64.8], [79.1, 78.9, 78.7, 39.8, 40.1, 46.2, 79.1, 44.8, 102.1, 89.2, 19.1, 19.1, 7.3, 85.2, 15.8, 14.5, 177.5, 12.9, 5.2, 4.4, 11.3, 9.4, 3.5, 31.7, 116.4, 10.4, 86, 34.9, 75.3, 0, 9.9], [71.2, 71, 71, 30.5, 30.8, 36.7, 68.4, 37.8, 91.5, 78.9, 9.5, 9.5, 2.8, 95.9, 19.3, 20.7, 188.1, 8.3, 8, 11.4, 1.4, 13.8, 7.3, 29.9, 106.2, 2, 82.4, 25.2, 64.8, 9.9, 0]];
  let CASA = CAMPOS.findIndex(c => /Palau d'Esports/i.test(c));
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // ---------- Campo del partido -> fila de la matriz (búsqueda flexible) ----------
  const VACIAS = new Set(["pab", "pav", "pabellon", "pavello", "mun", "municipal", "polid", "polideportivo", "poliesportiu", "de", "del", "la", "el", "l", "d", "les", "els", "c", "e", "p", "m", "ies", "col", "colegio", "cp", "y", "i", "pista", "pistas", "gimnasio"]);
  const fichas = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ny/g, "n").replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1 && !VACIAS.has(w));
  let FICHAS_CAMPOS = CAMPOS.map(fichas);

  // ---------- Matriz actualizada desde el Excel (opcional) ----------
  // Si se ha cargado una versión nueva de Matriz_Distancias_Campos.xlsx, se usa
  // esa (guardada en el navegador y en GitHub Kilometraje/matriz.json).
  const MATRIZ_GH = "Kilometraje/matriz.json";
  let matrizFecha = "";
  function usarMatriz(d) {
    if (!d || !Array.isArray(d.campos) || !Array.isArray(d.dist) || d.dist.length !== d.campos.length) return false;
    const casa = d.campos.findIndex(c => /Palau d'Esports/i.test(c));
    if (casa < 0) return false;
    CAMPOS = d.campos; DIST = d.dist; CASA = casa; FICHAS_CAMPOS = CAMPOS.map(fichas); matrizFecha = d.fecha || "";
    return true;
  }
  try { usarMatriz(JSON.parse(localStorage.getItem("NVA_KM_MATRIZ") || "null")); } catch (e) {}
  async function matrizGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token || !navigator.onLine) return false;
    try {
      const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${MATRIZ_GH}`, {
        cache: "no-store", headers: { "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github.raw" } });
      if (!r.ok) return false;
      const d = await r.json();
      if ((d.fecha || "") <= matrizFecha || !usarMatriz(d)) return false;
      try { localStorage.setItem("NVA_KM_MATRIZ", JSON.stringify(d)); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw";
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
      s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar el lector de Excel"));
      document.head.appendChild(s);
    });
  }
  async function actualizarMatriz(file) {
    await cargarXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames.find(n => /matriz|distanc/i.test(n)) || wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).filter(r => r.some(c => String(c).trim()));
    const campos = rows[0].slice(1).map(c => String(c).trim()).filter(Boolean);
    const num = (v) => typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    const dist = campos.map((c, i) => {
      const r = rows.find(x => String(x[0]).trim() === c) || rows[i + 1] || [];
      return campos.map((_, j) => { const n = num(r[j + 1]); return isNaN(n) ? 0 : n; });
    });
    const d = { campos, dist, fecha: new Date().toISOString(), archivo: file.name };
    if (!campos.length) throw new Error("no encuentro la fila de campos en la primera hoja");
    if (!campos.some(c => /Palau d'Esports/i.test(c))) throw new Error("falta el campo «Palau d'Esports (Alzira)»");
    const nuevos = campos.filter(c => !CAMPOS.includes(c)).length, quitados = CAMPOS.filter(c => !campos.includes(c)).length;
    if (!confirm(`Matriz leída: ${campos.length} campos (${nuevos} nuevos, ${quitados} quitados).\n\n¿Usar estas distancias a partir de ahora?`)) return false;
    usarMatriz(d);
    try { localStorage.setItem("NVA_KM_MATRIZ", JSON.stringify(d)); } catch (e) {}
    const ok = await writeGitHubFile(MATRIZ_GH, d, "Actualizar matriz de distancias");
    alert(ok ? "Distancias actualizadas y guardadas en GitHub." : "Distancias actualizadas en este dispositivo. Se subirán a GitHub cuando haya conexión.");
    return true;
  }
  function campoDe(m) {
    if (m.home) return CASA;
    const f = fichas(m.venue);
    if (!f.length) return -1;
    let best = -1, bs = 0;
    FICHAS_CAMPOS.forEach((fc, i) => {
      const s = fc.filter(w => f.some(x => x === w || (w.length > 4 && x.startsWith(w.slice(0, 5))))).length / fc.length;
      if (s > bs) { bs = s; best = i; }
    });
    return bs >= 0.34 ? best : -1;
  }
  const km = (a, b) => (a < 0 || b < 0) ? 0 : (DIST[a][b] || 0);

  // ---------- Datos ----------
  let st = null;   // { desde, hasta (YYYY-MM-DD), coaches: [id...], filas: [...] }
  const dentro = (d) => !!d && d >= st.desde && d <= st.hasta;
  const finMes = (ym) => { const [y, m] = ym.split("-"); return `${ym}-${String(new Date(+y, +m, 0).getDate()).padStart(2, "0")}`; };
  // Si el rango es un mes completo se devuelve "YYYY-MM" (así se abren los reportes guardados por mes)
  const mesCompleto = () => st.desde.slice(8) === "01" && st.hasta === finMes(st.desde.slice(0, 7)) ? st.desde.slice(0, 7) : "";
  const fmtCorta = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-ES");
  function etiquetaRango() {
    const m = mesCompleto();
    return m ? `${MESES[+m.slice(5) - 1]} ${m.slice(0, 4)}` : `del ${fmtCorta(st.desde)} al ${fmtCorta(st.hasta)}`;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDia = (iso) => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }); };

  function partidosDe(coach, propio) {
    const cp = window.cpGetData ? window.cpGetData() : null;
    if (!cp || !cp.teams) return [];
    const out = [];
    getCoachTeamEntries(coach).forEach(e => {
      const t = cp.teams[e.teamKey];
      (t && t.matches || []).forEach(m => {
        if (!dentro(m.date) || /DESCANSA/i.test(m.rival || "")) return;
        // Los km salen del pabellón del partido, no de si el PDF lo pone como local
        const home = m.venue ? /PALAU/i.test(m.venue) : m.home === true;
        const c = campoDe(Object.assign({}, m, { home }));
        out.push({ id: e.teamKey + "|" + m.date + "|" + m.time + "|" + m.rival, key: e.teamKey, coach: coach.name, sust: !propio, equipo: e.name,
          date: m.date, time: m.time && m.time !== "00:00" ? m.time : "", rival: m.rival || "", home, local: m.home === true, venue: home ? CAMPOS[CASA] : (m.venue || ""),
          campo: c, kmMano: "", sel: propio, chain: false, salida: CASA });
      });
    });
    return out;
  }

  function cargar() {
    const viejas = new Map((st.filas || []).map(f => [f.id, f]));
    const filas = [];
    st.coaches.forEach((id, i) => {
      const c = appData.coaches.find(x => String(x.id) === String(id));
      if (!c) return;
      partidosDe(c, i === 0).forEach(f => {
        if (filas.some(x => x.id === f.id)) return;   // equipo compartido: una sola vez
        filas.push(Object.assign(f, viejas.get(f.id) ? pick(viejas.get(f.id)) : {}));
      });
    });
    // Otros eventos añadidos a mano (solo los de las fechas elegidas)
    (st.filas || []).forEach(f => { if (f.evento && dentro(f.date)) filas.push(f); });
    filas.sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));
    st.filas = filas;
  }
  // ---------- Guardar / recuperar (por entrenador y mes) ----------
  // Se guarda en el navegador y en GitHub (Kilometraje/km_<entrenador>_<mes>.json).
  const archivo = () => { const c = appData.coaches.find(x => String(x.id) === st.coaches[0]); return `Kilometraje/km_${sanitizeFileName(c ? c.name : st.coaches[0])}_${mesCompleto() || st.desde + "_" + st.hasta}.json`; };
  const claveLocal = () => "NVA_KM_" + archivo();
  function datosGuardar() {
    return { coaches: st.coaches.slice(), desde: st.desde, hasta: st.hasta, guardado: new Date().toISOString(),
      filas: st.filas.map(f => Object.assign({ id: f.id }, f.evento ? datosEvento(f) : {}, pick(f), { campoN: CAMPOS[f.campo] || "", salidaN: CAMPOS[f.salida] || "" })), total: +calcular().reduce((a, f) => a + f._km, 0).toFixed(1) };
  }
  function aplicar(d) {
    if (!d || !Array.isArray(d.filas)) return false;
    st.coaches = [st.coaches[0]].concat((d.coaches || []).slice(1).filter(id => appData.coaches.some(c => String(c.id) === String(id))));
    st.filas = d.filas.map(f => { const x = Object.assign({}, f), ci = CAMPOS.indexOf(f.campoN), si = CAMPOS.indexOf(f.salidaN);
      if (f.campoN !== undefined) x.campo = ci; if (f.salidaN !== undefined) x.salida = si >= 0 ? si : CASA; return x; });   // cargar() toma de aquí lo marcado
    st.guardado = d.guardado || "";
    return true;
  }
  function leerLocal() { try { return JSON.parse(localStorage.getItem(claveLocal()) || "null"); } catch (e) { return null; } }
  async function leerGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token || !navigator.onLine) return null;
    try {
      const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${archivo()}`, {
        cache: "no-store", headers: { "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github.raw" } });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  async function guardar(o) {
    const d = datosGuardar();
    try { localStorage.setItem(claveLocal(), JSON.stringify(d)); } catch (e) {}
    st.guardado = d.guardado; pintar(o);
    const ok = await writeGitHubFile(archivo(), d, `Kilometraje ${etiquetaRango()}`);
    alert(ok ? "Reporte de kilometraje guardado y sincronizado en GitHub." : "Guardado en este dispositivo. Se sincronizará con GitHub cuando haya conexión.");
  }

  const datosEvento = (f) => ({ evento: true, date: f.date, time: f.time, concepto: f.concepto, ciudad: f.ciudad, equipo: "Otro evento", rival: f.concepto, venue: f.ciudad, home: false, coach: f.coach, sust: false });
  const pick = (o) => ({ sel: o.sel, chain: o.chain, salida: o.salida, campo: o.campo, kmMano: o.kmMano });

  // Km de cada partido elegido: ida (desde la salida o desde el partido anterior
  // si está encadenado) + vuelta a casa (si no se encadena con el siguiente).
  // Partido bloqueado: no tiene registro del partido hecho (con jugadores/as).
  // Un registro con solo el resultado no vale. Sus km no cuentan.
  function tieneRegistro(f) {
    if (f.evento) return true;
    const logs = typeof allMatchLogs !== "undefined" ? allMatchLogs : [];
    return logs.some(l => l.equipo === f.key && l.fecha === f.date && Array.isArray(l.jugadores) && l.jugadores.length > 0);
  }
  function calcular() {
    st.filas.forEach(f => { f._lock = !tieneRegistro(f); });
    const s = st.filas.filter(f => f.sel && !f._lock);
    s.forEach((f, i) => {
      const prev = i > 0 && s[i - 1].chain ? s[i - 1] : null;
      const next = f.chain && i < s.length - 1;
      const desde = prev ? prev.campo : f.salida;
      f._ruta = [prev ? corto(prev.campo, prev.venue) : corto(f.salida), corto(f.campo, f.venue)].concat(next ? [] : [corto(CASA)]);
      f._encadenado = !!prev; f._sigue = next;
      if (f.campo < 0) { f._km = parseFloat(String(f.kmMano).replace(",", ".")) || 0; f._sinMatriz = true; return; }
      f._sinMatriz = false;
      f._km = +(km(desde, f.campo) + (next ? 0 : km(f.campo, CASA))).toFixed(1);
    });
    return s;
  }
  const corto = (i, txt) => i >= 0 ? CAMPOS[i] : (txt || "?");

  // ---------- Ventana ----------
  function estilos() {
    if (document.getElementById("kmStyles")) return;
    const s = document.createElement("style");
    s.id = "kmStyles";
    s.textContent = `
      .km-box { max-width: 560px; max-height: calc(100vh - 24px); }
      .km-top { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .km-top select, .km-top input, .km-row select, .km-row input[type=text] { background: var(--noche); color: var(--tiza); border: 1px solid var(--linea); border-radius: 8px; padding: 5px 6px; font: inherit; font-size: 0.8rem; }
      .km-top select { flex: 1; min-width: 0; }
      .km-fechas .km-coach { flex: 0 1 30%; }
      .km-rango { flex: 1 1 60%; display: flex; align-items: center; gap: 4px; min-width: 0; }
      .km-rango input { flex: 1; min-width: 0; font-size: 0.85rem; }
      .km-rango span { font-size: 0.75rem; color: var(--niebla); }
      .km-chip { font-size: 0.72rem; background: rgba(245,197,24,0.15); color: var(--balon); border-radius: 999px; padding: 3px 8px; display: inline-flex; gap: 4px; align-items: center; }
      .km-chip button { background: none; border: 0; color: inherit; cursor: pointer; padding: 0; }
      .km-list { overflow-y: auto; flex: 1; min-height: 120px; padding-right: 2px; }
      .km-row { position: relative; display: grid; grid-template-columns: 22px 1fr auto; gap: 6px; align-items: start; background: rgba(233,238,250,0.06); border: 1px solid var(--linea); border-radius: 10px; padding: 8px 8px 14px; margin-bottom: 10px; transition: margin .25s, border-radius .25s, opacity .2s; }
      .km-row.off { opacity: 0.45; }
      .km-row.km-lock { opacity: 1; background: rgba(120,120,120,0.18); border-style: dashed; }
      .km-row.km-lock .km-t, .km-row.km-lock .km-k { color: var(--niebla); }
      .km-reg { margin-top: 6px; background: var(--balon); color: var(--noche); border: 0; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer; filter: none; }
      .km-row.km-sigue { margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-color: transparent; }
      .km-row.km-viene { border-top-left-radius: 0; border-top-right-radius: 0; border-top: 1px dashed var(--balon); }
      .km-row .km-t { font-size: 0.8rem; line-height: 1.3; }
      .km-row .km-t b { color: var(--balon); }
      .km-row .km-s { font-size: 0.7rem; color: var(--niebla); margin-top: 2px; }
      .km-row .km-k { text-align: right; font-family: var(--font-display); font-size: 1.15rem; color: var(--tiza); white-space: nowrap; }
      .km-row .km-k small { display: block; font-family: var(--font-body); font-size: 0.62rem; color: var(--niebla); }
      .km-row select { max-width: 100%; margin-top: 4px; font-size: 0.7rem; }
      .km-row input[type=text] { width: 64px; text-align: right; }
      .km-flecha { position: absolute; left: 50%; bottom: -13px; transform: translateX(-50%); z-index: 2; width: 26px; height: 18px; border-radius: 9px; border: 1px solid var(--linea); background: var(--pista); color: var(--niebla); cursor: pointer; font-size: 0.75rem; line-height: 1; padding: 0; transition: all .25s cubic-bezier(0.23,1,0.32,1); }
      .km-flecha.on { height: 30px; bottom: -16px; background: var(--balon); color: var(--noche); border-color: var(--balon); }
      .km-total { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--linea); padding-top: 8px; font-family: var(--font-display); font-size: 1.3rem; }
      .km-total b { color: var(--balon); font-size: 1.6rem; }
      .km-aviso { font-size: 0.7rem; color: var(--balon); }
      @media (prefers-reduced-motion: reduce) { .km-row, .km-flecha { transition: none; } }`;
    document.head.appendChild(s);
  }

  function opcionesCampos(sel, conOtro) {
    return (conOtro ? `<option value="-1"${sel < 0 ? " selected" : ""}>¿? Otro campo (km a mano)</option>` : "") +
      CAMPOS.map((c, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
  }

  function pintar(o) {
    const s = calcular();
    const list = o.querySelector(".km-list");
    if (!st.filas.length) { list.innerHTML = `<div class="cp-modal-txt">No hay partidos de estos equipos ${mesCompleto() ? "en " : ""}${etiquetaRango()}. Revisa que los calendarios estén cargados en «Equipos · PDF Competición».</div>`; }
    else list.innerHTML = st.filas.map((f, i) => {
      if (f._lock) return `<div class="km-row km-lock" data-i="${i}">
        <span title="Sin registro del partido">🔒</span>
        <div>
          <div class="km-t"><b>${esc(fmtDia(f.date))}${f.time ? " · " + esc(f.time) : ""}</b> · ${esc(f.equipo)}</div>
          <div class="km-t">${(f.local ?? f.home) ? "🏠 vs " : "🚌 en "}${esc(f.rival)}${f.sust ? ` (sustituyendo a ${esc(f.coach)})` : ""}</div>
          <div class="km-s">Sin registro del partido: sus km no cuentan.</div>
          <button type="button" class="km-reg">📝 Hacer registro</button>
        </div>
        <div class="km-k">–<small>km</small></div>
      </div>`;
      const k = f.sel ? s.indexOf(f) : -1;
      const hayNext = k >= 0 && k < s.length - 1;
      return `<div class="km-row${f.sel ? "" : " off"}${f._sigue && f.sel ? " km-sigue" : ""}${f._encadenado && f.sel ? " km-viene" : ""}" data-i="${i}">
        <input type="checkbox" class="km-sel" ${f.sel ? "checked" : ""}>
        <div>
          <div class="km-t"><b>${esc(fmtDia(f.date))}${f.time ? " · " + esc(f.time) : ""}</b> · ${esc(f.equipo)}</div>
          ${f.evento ? `<div class="km-t">📌 ${esc(f.concepto)}${f.campo < 0 && f.ciudad ? " · " + esc(f.ciudad) : ""} <button type="button" class="km-ev-del" title="Quitar evento" style="background:none;border:0;color:var(--niebla);cursor:pointer;font-size:0.75rem">✕</button></div>` : `<div class="km-t">${(f.local ?? f.home) ? "🏠 vs " : "🚌 en "}${esc(f.rival)}${f.sust ? ` <span class="km-aviso">(sustituyendo a ${esc(f.coach)})</span>` : ""}</div>`}
          ${f.home ? "" : `<select class="km-campo" title="Campo del partido">${opcionesCampos(f.campo, true)}</select>${f.campo < 0 && f.venue ? `<div class="km-s">PDF: ${esc(f.venue)}</div>` : ""}`}
          ${f.sel && !f._encadenado ? `<div class="km-s">Salida: <select class="km-salida">${opcionesCampos(f.salida, false)}</select></div>` : ""}
          ${f.sel ? `<div class="km-s">${f._ruta.map(esc).join(" → ")}</div>` : ""}
        </div>
        <div class="km-k">${f.sel ? (f._sinMatriz ? `<input type="text" class="km-mano" inputmode="decimal" placeholder="km" value="${esc(f.kmMano)}">` : f._km.toFixed(1)) : "–"}<small>km</small></div>
        ${hayNext ? `<button type="button" class="km-flecha${f.chain ? " on" : ""}" title="${f.chain ? "Encadenado: va directo al siguiente partido" : "Pulsa si de aquí va directo al siguiente partido"}">⬇</button>` : ""}
      </div>`;
    }).join("");
    const total = s.reduce((a, f) => a + f._km, 0);
    o.querySelector(".km-sum").textContent = total.toFixed(1).replace(".", ",") + " km";
    o.querySelector(".km-est").textContent = st.guardado ? "💾 Guardado " + new Date(st.guardado).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sin guardar";
    o.querySelector(".km-num").textContent = `${s.length} partido${s.length === 1 ? "" : "s"}`;
    o.querySelector(".km-chips").innerHTML = st.coaches.slice(1).map(id => {
      const c = appData.coaches.find(x => String(x.id) === String(id));
      return c ? `<span class="km-chip">+ ${esc(c.name)} <button data-id="${esc(id)}" title="Quitar">✕</button></span>` : "";
    }).join("");
  }

  // ---------- Otro evento (desplazamiento que no es un partido) ----------
  function nuevoEvento(o) {
    const w = document.createElement("div");
    w.className = "cp-modal";
    w.style.zIndex = "100005";
    const hoy = new Date().toISOString().slice(0, 10);
    const fecha = dentro(hoy) ? hoy : st.desde;
    const coach = appData.coaches.find(c => String(c.id) === st.coaches[0]);
    w.innerHTML = `<div class="cp-modal-box km-box" style="max-width:400px">
      <div class="cp-modal-title">📌 Otro evento</div>
      <div class="km-top"><input type="text" class="ev-concepto" placeholder="Concepto (p. ej. Reunión federación)" style="flex:1"></div>
      <div class="km-top"><input type="date" class="ev-fecha" value="${fecha}" min="${st.desde}" max="${st.hasta}" style="flex:1"><input type="time" class="ev-hora"></div>
      <div class="km-top"><select class="ev-campo" style="flex:1"><option value="-1">— Otra ciudad (km a mano) —</option>${CAMPOS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join("")}</select></div>
      <div class="km-top ev-manual"><input type="text" class="ev-ciudad" placeholder="Ciudad" style="flex:1"><input type="text" class="ev-km" inputmode="decimal" placeholder="km" style="width:70px;text-align:right"></div>
      <div class="km-s ev-auto" style="display:none;font-size:0.8rem"></div>
      <div class="cp-modal-row">
        <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
        <button class="cp-modal-btn cp-modal-main">Incluir en el reporte</button>
      </div>
    </div>`;
    document.body.appendChild(w);
    const $ = (c) => w.querySelector(c);
    const pintaCampo = () => {
      const c = +$(".ev-campo").value;
      $(".ev-manual").style.display = c < 0 ? "" : "none";
      $(".ev-auto").style.display = c < 0 ? "none" : "";
      if (c >= 0) $(".ev-auto").textContent = `🚗 ${CAMPOS[CASA]} → ${CAMPOS[c]} → ${CAMPOS[CASA]}: ${(km(CASA, c) + km(c, CASA)).toFixed(1).replace(".", ",")} km`;
    };
    $(".ev-campo").onchange = pintaCampo;
    $(".cp-modal-stop").onclick = () => w.remove();
    $(".cp-modal-main").onclick = () => {
      const concepto = $(".ev-concepto").value.trim(), date = $(".ev-fecha").value, campo = +$(".ev-campo").value;
      const ciudad = $(".ev-ciudad").value.trim(), kmMano = $(".ev-km").value.trim();
      if (!concepto) { alert("Escribe el concepto del evento."); return; }
      if (!dentro(date)) { alert("Elige una fecha dentro de las fechas del reporte."); return; }
      if (campo < 0 && (!ciudad || !(parseFloat(kmMano.replace(",", ".")) >= 0))) { alert("Escribe la ciudad y los km."); return; }
      const f = Object.assign(datosEvento({ date, time: $(".ev-hora").value, concepto, ciudad: campo < 0 ? ciudad : "", coach: coach ? coach.name : "" }),
        { id: "ev|" + Date.now(), campo, kmMano: campo < 0 ? kmMano : "", sel: true, chain: false, salida: CASA });
      st.filas.push(f);
      st.filas.sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));
      w.remove();
      pintar(o);
    };
    pintaCampo();
    $(".ev-concepto").focus();
  }

  // ---------- Ir al registro del partido y volver ----------
  let volverAKm = false;
  function abrirRegistro(f, o) {
    const coach = appData.coaches.find(c => c.name === f.coach);
    if (!coach) { alert("No encuentro al entrenador de este partido."); return; }
    volverAKm = true;
    o.remove();
    selectCoachAndTeam(coach, f.key, f.equipo);
    goToMatchScreen();
    const picker = document.getElementById("matchDatePicker");
    if (picker) { picker.value = f.date; initMatchData(); picker.dispatchEvent(new Event("change")); renderMatchPlayers(); }
  }
  const origGoBack = window.goBack;
  window.goBack = async function () {
    const vuelve = volverAKm && st;
    volverAKm = false;
    try { return await origGoBack.apply(this, arguments); }
    finally { if (vuelve) window.openKilometrajeModal(true); }
  };

  window.openKilometrajeModal = function (volver) {
    if (!appData.coaches.length) { alert("No hay entrenadores."); return; }
    estilos();
    const hoy = new Date();
    const seguir = volver === true && st;
    const primero = seguir ? st.coaches[0] : (typeof activeCoachId !== "undefined" && activeCoachId != null && appData.coaches.some(c => c.id == activeCoachId)) ? activeCoachId : appData.coaches[0].id;
    const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    if (!seguir) st = { desde: mesHoy + "-01", hasta: finMes(mesHoy), coaches: [String(primero)], filas: [] };
    const o = document.createElement("div");
    o.className = "cp-modal";
    const optsCoach = (sel) => appData.coaches.map(c => `<option value="${esc(c.id)}"${String(c.id) === String(sel) ? " selected" : ""}>${esc(c.name)}</option>`).join("");
    o.innerHTML = `<div class="cp-modal-box km-box">
      <div class="cp-modal-title">🚗 Reporte Kilometraje</div>
      <div class="km-top km-fechas"><select class="km-coach" title="Entrenador">${optsCoach(primero)}</select><span class="km-rango"><input type="date" class="km-desde" value="${st.desde}" title="Desde"><span>al</span><input type="date" class="km-hasta" value="${st.hasta}" title="Hasta"></span></div>
      <div class="km-top"><button type="button" class="cp-modal-btn km-otro" style="flex:none;font-size:0.72rem;padding:5px 8px;">➕ Partidos de otro entrenador</button><button type="button" class="cp-modal-btn km-evento" style="flex:none;font-size:0.72rem;padding:5px 8px;">➕ Otro evento</button><span class="km-chips"></span></div>
      <div class="km-list"></div>
      <div class="km-total"><span>TOTAL <small class="km-num" style="font-size:0.8rem;color:var(--niebla)"></small></span><b class="km-sum"></b></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <button type="button" class="km-matriz" title="Cargar Matriz_Distancias_Campos.xlsx modificado" style="background:none;border:0;padding:0;color:var(--niebla);font-size:0.65rem;text-decoration:underline;cursor:pointer">📏 Actualizar distancias</button>
        <input type="file" class="km-matriz-file" accept=".xlsx,.xls" hidden>
        <div class="km-aviso km-est" style="text-align:right;color:var(--niebla)"></div>
      </div>
      <div class="cp-modal-row">
        <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
        <button class="cp-modal-btn km-guardar">💾 Guardar</button>
        <button class="cp-modal-btn cp-modal-main">📄 PDF</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    // Al cambiar de entrenador o mes se recupera lo guardado (primero lo local, luego GitHub)
    const recargar = async (conGuardado) => {
      if (conGuardado) {
        st.filas = []; st.guardado = "";
        aplicar(leerLocal());
        cargar(); pintar(o);
        const rango = st.desde + st.hasta, c0 = st.coaches[0];
        const gh = await leerGitHub();
        const loc = leerLocal();
        if (gh && rango === st.desde + st.hasta && c0 === st.coaches[0] && (!loc || (gh.guardado || "") > (loc.guardado || ""))) { aplicar(gh); cargar(); pintar(o); }
        return;
      }
      cargar(); pintar(o);
    };
    o.querySelector(".km-coach").onchange = (e) => { st.coaches[0] = e.target.value; st.coaches = st.coaches.filter((x, i) => i === 0 || x !== e.target.value); recargar(true); };
    const fDesde = o.querySelector(".km-desde"), fHasta = o.querySelector(".km-hasta");
    const cambiaRango = (e) => {
      if (!fDesde.value || !fHasta.value) return;
      if (fHasta.value < fDesde.value) { if (e.target === fDesde) fHasta.value = fDesde.value; else fDesde.value = fHasta.value; }
      st.desde = fDesde.value; st.hasta = fHasta.value; recargar(true);
    };
    fDesde.onchange = cambiaRango; fHasta.onchange = cambiaRango;
    o.querySelector(".km-otro").onclick = () => {
      const libres = appData.coaches.filter(c => !st.coaches.includes(String(c.id)));
      if (!libres.length) { alert("No hay más entrenadores."); return; }
      const nombre = prompt("¿De qué entrenador quieres añadir partidos?\n\n" + libres.map((c, i) => `${i + 1}. ${c.name}`).join("\n") + "\n\nEscribe el número:");
      const c = libres[(parseInt(nombre, 10) || 0) - 1];
      if (c) { st.coaches.push(String(c.id)); recargar(); }
    };
    o.querySelector(".km-chips").onclick = (e) => { const b = e.target.closest("button[data-id]"); if (b) { st.coaches = st.coaches.filter(x => x !== b.dataset.id); recargar(); } };
    const lista = o.querySelector(".km-list");
    const fila = (e) => st.filas[+e.target.closest(".km-row").dataset.i];
    o.querySelector(".km-evento").onclick = () => nuevoEvento(o);
    lista.addEventListener("click", (e) => {
      if (e.target.classList.contains("km-ev-del")) { const f = fila(e); if (confirm(`¿Quitar el evento «${f.concepto}»?`)) { st.filas = st.filas.filter(x => x !== f); pintar(o); } return; }
      if (e.target.classList.contains("km-flecha")) { const f = fila(e); f.chain = !f.chain; pintar(o); }
      if (e.target.classList.contains("km-reg")) abrirRegistro(fila(e), o);
    });
    lista.addEventListener("change", (e) => {
      const f = fila(e), t = e.target;
      if (t.classList.contains("km-sel")) { f.sel = t.checked; if (!f.sel) f.chain = false; }
      else if (t.classList.contains("km-campo")) f.campo = +t.value;
      else if (t.classList.contains("km-salida")) f.salida = +t.value;
      else if (t.classList.contains("km-mano")) f.kmMano = t.value;
      pintar(o);
    });
    o.querySelector(".cp-modal-stop").onclick = () => o.remove();
    o.querySelector(".km-guardar").onclick = () => guardar(o);
    const fMatriz = o.querySelector(".km-matriz-file");
    o.querySelector(".km-matriz").onclick = () => { fMatriz.value = ""; fMatriz.click(); };
    fMatriz.onchange = async () => {
      if (!fMatriz.files[0]) return;
      try { if (await actualizarMatriz(fMatriz.files[0])) { st.filas.forEach(f => { f.campo = campoDe(f); }); recargar(true); } }
      catch (e) { alert("No se pudo leer la matriz: " + (e.message || e)); }
    };
    matrizGitHub().then(n => { if (n) recargar(true); });
    o.querySelector(".cp-modal-main").onclick = () => guardarPdf();
    if (seguir) { cargar(); pintar(o); } else recargar(true);
    // Registros de partido al día (por si se hicieron desde otro dispositivo)
    if (typeof fetchMatchLogsFromGitHub === "function") fetchMatchLogsFromGitHub().then(() => { if (o.isConnected) pintar(o); }).catch(() => {});
  };

  // ---------- PDF (jsPDF, A4 vertical) ----------
  async function guardarPdf() {
    const s = calcular();
    if (!s.length) { alert("Marca al menos un partido."); return; }
    if (s.some(f => f._sinMatriz && !f._km)) { if (!confirm("Hay partidos sin campo en la matriz y sin km escritos (contarán 0 km). ¿Guardar igualmente?")) return; }
    try {
      await ensureExportLibs();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const coach = appData.coaches.find(c => String(c.id) === st.coaches[0]);
      const W = 210, X = 12;
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      const cab = () => nvaPdfBand(pdf, logo, {
        kicker: "Club Nou Vòlei Alzira",
        title: "Reporte de kilometraje",
        sub: `Entrenador/a: ${coach ? coach.name : ""}  ·  ${etiquetaRango()}`
      });
      const cols = [{ t: "Fecha", w: 20 }, { t: "Hora", w: 11 }, { t: "Equipo", w: 36 }, { t: "Partido", w: 38 }, { t: "Recorrido", w: 64 }, { t: "Km", w: 17 }];
      const filaCab = (yy) => {
        pdf.setFillColor(13, 27, 69); pdf.roundedRect(X, yy - 4.5, W - 2 * X, 6.5, 1.2, 1.2, "F");
        pdf.setTextColor(255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
        let x = X + 1.5; cols.forEach((c, i) => { pdf.text(c.t, i === cols.length - 1 ? x + c.w - 3 : x, yy, i === cols.length - 1 ? { align: "right" } : undefined); x += c.w; });
        return yy + 6;
      };
      cab();
      let yy = filaCab(36);
      pdf.setFontSize(8);
      s.forEach((f, i) => {
        const partido = f.evento ? f.concepto : ((f.local ?? f.home) ? "vs " : "en ") + f.rival + (f.sust ? ` (sust. a ${f.coach})` : "");
        const celdas = [new Date(f.date + "T12:00:00").toLocaleDateString("es-ES"), f.time || "-", f.equipo, partido, f._ruta.join(" > "), f._km.toFixed(1).replace(".", ",")];
        const lineas = celdas.map((t, k) => pdf.splitTextToSize(String(t), cols[k].w - 3));
        const h = Math.max(...lineas.map(l => l.length)) * 3.6 + 2.4;
        if (yy + h > 278) { pdf.addPage(); cab(); yy = filaCab(36); pdf.setFontSize(8); }
        if (i % 2 === 1) { pdf.setFillColor(246, 248, 253); pdf.rect(X, yy - 3.6, W - 2 * X, h, "F"); }
        if (f._encadenado) { pdf.setDrawColor(245, 197, 24); pdf.setLineWidth(0.8); pdf.line(X, yy - 3.6, X, yy - 3.6 + h); }
        pdf.setTextColor(30, 41, 59); pdf.setFont("helvetica", "normal");
        let x = X + 1.5;
        lineas.forEach((l, k) => {
          if (k === cols.length - 1) { pdf.setFont("helvetica", "bold"); pdf.text(l, x + cols[k].w - 3, yy, { align: "right" }); }
          else pdf.text(l, x, yy);
          x += cols[k].w;
        });
        yy += h;
      });
      const total = s.reduce((a, f) => a + f._km, 0);
      if (yy + 26 > 278) { pdf.addPage(); cab(); yy = 36; }
      // Marcador del total
      yy += 2;
      pdf.setFillColor(13, 27, 69); pdf.roundedRect(X, yy, W - 2 * X, 14, 2, 2, "F");
      pdf.setFillColor(245, 197, 24); pdf.rect(X, yy, 1.6, 14, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(245, 197, 24);
      pdf.text("TOTAL DEL MES", X + 6, yy + 5.6, { charSpace: 0.5 });
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(233, 238, 250);
      pdf.text(`${s.length} partido${s.length === 1 ? "" : "s"}`, X + 6, yy + 10.6);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(255, 255, 255);
      pdf.text(total.toFixed(1).replace(".", ",") + " km", W - X - 5, yy + 9.6, { align: "right" });
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(110);
      pdf.text(pdf.splitTextToSize("Salida y vuelta: Palau d'Esports (Alzira) salvo indicación. Partidos encadenados (barra amarilla): se va directo desde el campo anterior.", W - 2 * X), X, yy + 19);
      nvaPdfFooters(pdf);
      pdf.save(`Kilometraje_${sanitizeFileName(coach ? coach.name : "")}_${mesCompleto() || st.desde + "_" + st.hasta}.pdf`);
    } catch (e) { alert("No se pudo crear el PDF: " + (e.message || e)); }
  }
})();
