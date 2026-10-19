/* =====================================================================
   Sección Instagram
   - Se activa en cada dispositivo desde Opciones › Instagram poniendo el
     «token de Instagram»: el de la cuenta de GitHub que el club ha
     invitado como colaboradora al repositorio privado (no el token común
     de los entrenadores, que es de la cuenta propietaria).
   - Al activarlo se comprueba con GitHub que el token es válido, que puede
     escribir en el repositorio y que NO es de la cuenta propietaria.
   - El token se guarda solo en este dispositivo y se usará únicamente
     para las acciones de Instagram (borradores y publicación).
   OJO: esto solo muestra u oculta la sección. Quien impide de verdad que
   otros publiquen es el Action, que comprueba la cuenta que lo pide.
   ===================================================================== */
(function () {
  "use strict";

  const IG_KEY = "NVA_IG_SETTINGS";   // { token, login }
  try { localStorage.removeItem("NVA_IG_ENABLED"); } catch (e) { /* versión anterior, con contraseña */ }

  function loadIg() {
    try { return JSON.parse(localStorage.getItem(IG_KEY)) || null; } catch (e) { return null; }
  }

  function saveIg(data) {
    try {
      if (data) localStorage.setItem(IG_KEY, JSON.stringify(data));
      else localStorage.removeItem(IG_KEY);
    } catch (e) { console.warn(e); }
    applyVisibility();
  }

  function applyVisibility() {
    const ig = loadIg();
    const wrap = document.getElementById("igSectionWrap");
    if (wrap) wrap.hidden = !ig;
    const off = document.getElementById("igConfigOff");
    const on = document.getElementById("igConfigOn");
    if (off) off.hidden = !!ig;
    if (on) on.hidden = !ig;
    const who = document.getElementById("igConfigLogin");
    if (who) who.textContent = ig ? ig.login : "";
  }

  // Comprueba el token con GitHub. Devuelve { login } o lanza un Error con
  // un mensaje para el usuario. err.authFailed indica token caducado o sin acceso.
  async function checkIgToken(token) {
    if (!ghSettings.user || !ghSettings.repo) {
      throw new Error("Primero configura el repositorio en Opciones › Conexión GitHub.");
    }
    const headers = { "Authorization": `token ${token}`, "Accept": "application/vnd.github+json" };
    const fail = (msg) => { const e = new Error(msg); e.authFailed = true; return e; };

    const userRes = await fetch("https://api.github.com/user", { headers, cache: "no-store" });
    if (userRes.status === 401) throw fail("El token de Instagram no es válido o ha caducado.");
    if (!userRes.ok) throw new Error(`GitHub ha respondido con un error (${userRes.status}).`);
    const login = (await userRes.json()).login || "";

    if (login.toLowerCase() === ghSettings.user.toLowerCase()) {
      throw fail("Ese token es de la cuenta del club (la de los entrenadores). Usa el token de la cuenta de Instagram.");
    }

    const repoRes = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}`, { headers, cache: "no-store" });
    if (repoRes.status === 401) throw fail("El token de Instagram no es válido o ha caducado.");
    if (repoRes.status === 403 || repoRes.status === 404) {
      throw fail(`La cuenta ${login} no tiene acceso al repositorio. Comprueba que ha aceptado la invitación.`);
    }
    if (!repoRes.ok) throw new Error(`GitHub ha respondido con un error (${repoRes.status}).`);
    const perms = (await repoRes.json()).permissions || {};
    if (!perms.push) throw fail(`La cuenta ${login} puede ver el repositorio pero no escribir en él.`);

    return { login };
  }

  async function igActivate() {
    const input = document.getElementById("igTokenInput");
    const token = input.value.trim();
    if (!token) { alert("Pega el token de Instagram."); return; }
    if (!navigator.onLine) { alert("Hace falta conexión a internet para comprobar el token."); return; }
    try {
      const { login } = await checkIgToken(token);
      input.value = "";
      saveIg({ token, login });
      alert(`Instagram activado en este dispositivo (cuenta ${login}).`);
    } catch (err) {
      console.error(err);
      alert(err.message || "No se ha podido comprobar el token.");
    }
  }

  function igDeactivate() {
    if (!confirm("¿Quitar el token de Instagram de este dispositivo? La sección Instagram dejará de verse.")) return;
    saveIg(null);
  }

  // Al abrir la app se vuelve a comprobar el token guardado: si ha caducado
  // o ya no tiene acceso se quita la sección. Sin conexión se deja como está.
  async function recheckStoredToken() {
    const ig = loadIg();
    if (!ig || !navigator.onLine || !ghSettings.user || !ghSettings.repo) return;
    try {
      await checkIgToken(ig.token);
    } catch (err) {
      if (!err.authFailed) return;
      saveIg(null);
      alert(`Se ha desactivado la sección Instagram: ${err.message}`);
    }
  }

  window.igActivate = igActivate;
  window.igDeactivate = igDeactivate;
  window.igGetToken = () => (loadIg() || {}).token || null;

  applyVisibility();
  window.addEventListener("load", () => setTimeout(recheckStoredToken, 1500));
})();

/* =====================================================================
   Reels · borradores
   El Action «Generar reels» deja cada reel en Reels/borradores/<id>/
   (reel.mp4, portada.jpg, meta.json) y la lista en indice.json.
   Aquí se ven, se edita el texto y una persona los CONFIRMA. Nada se
   publica sin esa confirmación: confirmar escribe Reels/publicar.json.
   Todo se hace con el token de Instagram (el Action comprueba la cuenta).
   ===================================================================== */
(function () {
  "use strict";

  const DIR = "Reels/borradores";
  const ESTADOS = { borrador: "📝 Borrador", confirmado: "✅ Confirmado · pendiente de publicar", publicado: "📲 Publicado", descartado: "🗑️ Descartado", error: "⚠️ Error al publicar" };
  const TIPOS = { resultados: "🏆 Resultados de la semana", proximos: "📅 Próximos partidos", actividad: "📸 Actividad", evento: "📸 Evento" };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}`; };
  const videos = {};   // id -> objectURL ya descargado

  const api = (path) => `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${path}`;
  const hdr = (extra) => Object.assign({ "Authorization": `token ${window.igGetToken()}` }, extra || {});

  async function getJson(path) {
    const r = await fetch(api(path), { headers: hdr({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  }

  async function putJson(path, obj, msg) {
    let sha = "";
    const g = await fetch(api(path), { headers: hdr(), cache: "no-store" });
    if (g.ok) sha = (await g.json()).sha;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
    const r = await fetch(api(path), { method: "PUT", headers: hdr({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: msg, content, ...(sha && { sha }) }) });
    if (!r.ok) throw new Error(`No se ha podido guardar en GitHub (${r.status}).`);
  }

  async function blobUrl(path) {
    const r = await fetch(api(path), { headers: hdr({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    // El tipo hace falta para que el móvil (sobre todo iPhone) reproduzca el vídeo
    const tipo = /\.mp4$/.test(path) ? "video/mp4" : /\.jpe?g$/.test(path) ? "image/jpeg" : "";
    const datos = await r.blob();
    return URL.createObjectURL(tipo ? new Blob([datos], { type: tipo }) : datos);
  }

  function box() { return document.getElementById("igReelsList"); }

  async function cargar() {
    const el = box();
    if (!el || !window.igGetToken()) return;
    el.innerHTML = `<p class="ig-info">Cargando borradores…</p>`;
    try {
      const idx = await getJson(`${DIR}/indice.json`);
      const lista = ((idx && idx.borradores) || []).filter(b => b.estado !== "descartado").slice(0, 12);
      if (!lista.length) { el.innerHTML = `<p class="ig-info">Todavía no hay borradores. Se crean solos el lunes a las 18:00 (resultados) y el martes a las 21:00 (próximos partidos), o con «Generar ahora».</p>`; return; }
      el.innerHTML = lista.map(b => `
        <div class="ig-reel" data-id="${esc(b.id)}">
          <div class="ig-reel-head">
            <img class="ig-portada" alt="" data-src="${esc(b.id)}">
            <div><b>${TIPOS[b.tipo] || esc(b.tipo)}</b><br><small>${b.tipo === "evento" ? `${esc(b.titulo || "")} · ${b.fotos || 0} fotos` : `${fmt(b.desde)} – ${fmt(b.hasta)} · ${b.partidos || 0} partidos`}</small><br>
              <span class="ig-estado ig-${esc(b.estado)}">${ESTADOS[b.estado] || esc(b.estado)}</span></div>
          </div>
          <button class="btn-pdf-mode ig-abrir" style="width:100%; margin:8px 0 0; background:var(--azul-primary); color:#fff;">${b.estado === "borrador" ? "👀 REVISAR Y CONFIRMAR" : "👀 VER"}</button>
          <div class="ig-detalle" hidden></div>
        </div>`).join("");
      el.querySelectorAll(".ig-portada").forEach(async img => {
        try { img.src = await blobUrl(`${DIR}/${img.dataset.src}/portada.jpg`); } catch (e) { img.remove(); }
      });
      el.querySelectorAll(".ig-abrir").forEach(btn => btn.onclick = () => abrir(btn.closest(".ig-reel")));
    } catch (e) {
      console.error(e);
      el.innerHTML = `<p class="ig-info">No se han podido leer los borradores (${esc(e.message)}).</p>`;
    }
  }

  async function abrir(card) {
    const id = card.dataset.id, det = card.querySelector(".ig-detalle");
    if (!det.hidden) { det.hidden = true; return; }
    det.hidden = false;
    det.innerHTML = `<p class="ig-info">Descargando el vídeo…</p>`;
    try {
      const meta = await getJson(`${DIR}/${id}/meta.json`);
      if (!videos[id]) videos[id] = await blobUrl(`${DIR}/${id}/reel.mp4`);
      const editable = meta.estado === "borrador";
      det.innerHTML = `
        <video class="ig-video" src="${videos[id]}" controls playsinline preload="metadata"></video>
        <p class="ig-info ig-video-err" hidden style="color:#b91c1c;">Este navegador no puede reproducir el vídeo aquí. Descárgalo para verlo.</p>
        <a class="ig-info" href="${videos[id]}" download="reel-${esc(id)}.mp4">⬇️ Descargar el vídeo</a>
        <label class="ig-label">Texto del post${editable ? " (puedes cambiarlo)" : ""}</label>
        <textarea class="ig-texto" rows="8" ${editable ? "" : "readonly"}>${esc(meta.texto)}</textarea>
        <small class="ig-info">Música: ${esc(meta.musica || "sin música")}${meta.confirmadoPor ? ` · Confirmado por ${esc(meta.confirmadoPor)}` : ""}</small>
        ${editable ? `<div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session ig-descartar" style="flex:1; background:#64748b;">🗑️ Descartar</button>
          <button class="btn-save-session ig-confirmar" style="flex:2;">✅ Confirmar y publicar</button></div>` : ""}`;
      const v = det.querySelector(".ig-video");
      v.onerror = () => { det.querySelector(".ig-video-err").hidden = false; console.error("Vídeo", v.error); };
      if (meta.enlace) det.insertAdjacentHTML("beforeend", `<p class="ig-info"><a href="${esc(meta.enlace)}" target="_blank" rel="noopener">📲 Ver en Instagram</a></p>`);
      if (meta.estado === "error") {
        det.insertAdjacentHTML("beforeend", `<p class="ig-info" style="color:#b91c1c;">${esc(meta.error)}</p>
          <button class="btn-save-session ig-reintentar" style="width:100%;">🔁 Reintentar publicación</button>`);
        det.querySelector(".ig-reintentar").onclick = () => { meta.estado = "borrador"; confirmar(id, meta); };
      }
      if (!editable) return;
      det.querySelector(".ig-descartar").onclick = () => cambiarEstado(id, meta, "descartado");
      det.querySelector(".ig-confirmar").onclick = () => {
        meta.texto = det.querySelector(".ig-texto").value.trim();
        confirmar(id, meta);
      };
    } catch (e) {
      console.error(e);
      det.innerHTML = `<p class="ig-info">No se ha podido abrir el borrador (${esc(e.message)}).</p>`;
    }
  }

  async function cambiarEstado(id, meta, estado, extra) {
    if (estado === "descartado" && !confirm("¿Descartar este borrador? No se publicará.")) return;
    try {
      Object.assign(meta, { estado }, extra || {});
      await putJson(`${DIR}/${id}/meta.json`, meta, `Reel ${id}: ${estado}`);
      const idx = (await getJson(`${DIR}/indice.json`)) || { borradores: [] };
      (idx.borradores || []).forEach(b => { if (b.id === id) b.estado = estado; });
      await putJson(`${DIR}/indice.json`, idx, `Reel ${id}: ${estado}`);
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      cargar();
    }
  }

  async function confirmar(id, meta) {
    if (!meta.texto) { alert("Escribe el texto del post."); return; }
    if (!confirm("¿Has visto el vídeo y el texto? Al confirmar se publicará en el Instagram del club.")) return;
    const quien = (JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}").login) || "";
    const ahora = new Date().toISOString();
    const ok = await cambiarEstado(id, meta, "confirmado", { confirmadoPor: quien, confirmadoEn: ahora });
    if (!ok) return;
    try {
      await putJson("Reels/publicar.json", { id, texto: meta.texto, confirmadoPor: quien, pedido: ahora }, `Publicar reel ${id}`);
      alert("Confirmado. El reel se publicará en Instagram en unos minutos.");
    } catch (e) { alert(e.message); }
  }

  /* ---------- Menú «Generar ahora» (resultados, próximos o evento manual) ---------- */
  const MAX_FOTOS = 10;
  let fotosEvento = [];   // [{ blob, url }]
  let dictado = null;

  function crearMenu() {
    if (document.getElementById("modalIgGenerar")) return;
    document.body.insertAdjacentHTML("beforeend", `
  <div class="modal-backdrop" id="modalIgGenerar">
    <div class="modal-box" style="max-width: 420px;">
      <div class="modal-header">
        <div class="modal-title" id="igGenTitulo">¿Qué reel quieres generar?</div>
        <button class="btn-close-modal" type="button" data-ig="cerrar">✕</button>
      </div>
      <div id="igGenMenu" style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn-save-session" type="button" data-ig="resultados">🏆 Resultados de la semana</button>
        <button class="btn-save-session" type="button" data-ig="proximos" style="background:var(--azul-primary);">📅 Próximos partidos</button>
        <button class="btn-save-session" type="button" data-ig="evento" style="background:var(--btn-fondoVerde);">📸 Evento manual</button>
      </div>
      <div id="igGenResultados" hidden>
        <p class="ig-info" id="igResInfo"></p>
        <div id="igResLista" style="display:flex; flex-direction:column; gap:6px; max-height:46vh; overflow:auto;"></div>
        <small class="ig-info" id="igResEstado"></small>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session" type="button" data-ig="volver" style="flex:1; background:#64748b;">← Volver</button>
          <button class="btn-save-session" type="button" id="igResPedir" style="flex:2;">🎬 Generar reel</button>
        </div>
      </div>
      <div id="igGenEvento" hidden>
        <label class="ig-label" for="igEvTitulo">Título del reel</label>
        <input type="text" id="igEvTitulo" class="app-input" maxlength="40" placeholder="Ej.: Challenge NVA">
        <label class="ig-label" for="igEvTexto">¿De qué va el reel?</label>
        <textarea id="igEvTexto" class="app-input" rows="4" placeholder="Cuenta un poco qué pasó: qué, dónde, cuándo, quién…"></textarea>
        <button class="btn-save-session" type="button" id="igEvVoz" style="width:100%; margin:6px 0; background:var(--azul-primary);">🎤 Dictar con la voz</button>
        <label class="ig-label">Fotos (hasta ${MAX_FOTOS})</label>
        <label class="btn-save-session" style="display:block; text-align:center; cursor:pointer; margin-bottom:6px; background:var(--btn-fondoVerde);">🖼️ Elegir fotos
          <input type="file" id="igEvFotos" accept="image/*" multiple hidden></label>
        <div id="igEvMiniaturas" style="display:grid; grid-template-columns:repeat(5,1fr); gap:4px;"></div>
        <small class="ig-info" id="igEvEstado"></small>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session" type="button" data-ig="volver" style="flex:1; background:#64748b;">← Volver</button>
          <button class="btn-save-session" type="button" id="igEvPedir" style="flex:2;">🎬 Generar reel</button>
        </div>
      </div>
    </div>
  </div>`);
    const m = document.getElementById("modalIgGenerar");
    m.addEventListener("click", (e) => {
      if (e.target === m) return cerrarMenu();
      const b = e.target.closest("[data-ig]");
      if (!b) return;
      const a = b.dataset.ig;
      if (a === "cerrar") cerrarMenu();
      else if (a === "volver") verPaso("menu");
      else if (a === "evento") verPaso("evento");
      else if (a === "resultados") prepararResultados();
      else pedirPartidos(a);
    });
    document.getElementById("igEvFotos").onchange = (e) => { anadirFotos(e.target.files); e.target.value = ""; };
    document.getElementById("igEvPedir").onclick = pedirEvento;
    document.getElementById("igResPedir").onclick = pedirResultados;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voz = document.getElementById("igEvVoz");
    if (!Rec) voz.hidden = true;
    else voz.onclick = () => alternarDictado(Rec, voz);
  }

  function verPaso(paso) {
    document.getElementById("igGenMenu").style.display = paso === "menu" ? "flex" : "none";
    document.getElementById("igGenEvento").hidden = paso !== "evento";
    document.getElementById("igGenResultados").hidden = paso !== "resultados";
    document.getElementById("igGenTitulo").textContent =
      { menu: "¿Qué reel quieres generar?", evento: "📸 Evento manual", resultados: "🏆 Fotos de los partidos" }[paso];
    if (paso !== "evento") pararDictado();
  }

  function cerrarMenu() {
    pararDictado();
    document.getElementById("modalIgGenerar").classList.remove("active");
  }

  function alternarDictado(Rec, boton) {
    if (dictado) { pararDictado(); return; }
    const area = document.getElementById("igEvTexto");
    const previo = area.value ? area.value.replace(/\s*$/, " ") : "";
    dictado = new Rec();
    dictado.lang = "es-ES"; dictado.continuous = true; dictado.interimResults = true;
    dictado.onresult = (ev) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      area.value = previo + t;
    };
    dictado.onerror = (ev) => {
      if (ev.error === "not-allowed") alert("El navegador no deja usar el micrófono. Revisa los permisos.");
    };
    dictado.onend = () => { dictado = null; boton.textContent = "🎤 Dictar con la voz"; };
    dictado.start();
    boton.textContent = "⏹️ Parar de dictar";
  }

  function pararDictado() { if (dictado) dictado.stop(); }

  /* ---------- Encuadre de la foto (zoom y posición) antes de añadirla ----------
     La foto sale en el reel en formato 4:5 y ningún texto ni color se pone encima,
     así que lo que se ve en este marco es exactamente lo que saldrá. */
  const FOTO_W = 1080, FOTO_H = 1350;

  function encuadrar(file) {
    return new Promise((resolver) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); alert(`No se ha podido leer ${file.name}`); resolver(null); };
      img.onload = () => {
        const capa = document.createElement("div");
        capa.style.cssText = "position:fixed; inset:0; z-index:10000; background:rgba(5,12,35,.86); display:flex; align-items:center; justify-content:center; padding:16px;";
        capa.innerHTML = `
          <div class="modal-box" style="max-width:380px; width:100%;">
            <div class="modal-header"><div class="modal-title">🔍 Ajusta la foto</div></div>
            <div class="ig-marco" style="position:relative; width:100%; aspect-ratio:4/5; overflow:hidden; border-radius:10px; background:#0b163a; touch-action:none; cursor:grab;">
              <img alt="" draggable="false" style="position:absolute; left:0; top:0; transform-origin:0 0; user-select:none; max-width:none;">
            </div>
            <label class="ig-label" style="display:flex; align-items:center; gap:8px; margin-top:10px;">➖
              <input type="range" class="ig-zoom" min="1" max="4" step="0.01" value="1" style="flex:1;">➕</label>
            <small class="ig-info">Arrastra la foto para encuadrarla y usa la barra para el zoom. Lo que ves en el marco es lo que saldrá en el reel.</small>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button class="btn-save-session" type="button" data-e="no" style="flex:1; background:#64748b;">Cancelar</button>
              <button class="btn-save-session" type="button" data-e="si" style="flex:2;">✅ Usar foto</button>
            </div>
          </div>`;
        document.body.appendChild(capa);
        const marco = capa.querySelector(".ig-marco"), vista = marco.querySelector("img"), zoom = capa.querySelector(".ig-zoom");
        vista.src = url;
        let FW = 0, FH = 0, base = 1, z = 1, ox = 0, oy = 0;
        const limitar = () => {
          const dw = img.naturalWidth * base * z, dh = img.naturalHeight * base * z;
          ox = Math.min(0, Math.max(FW - dw, ox)); oy = Math.min(0, Math.max(FH - dh, oy));
        };
        const pintar = () => { limitar(); vista.style.transform = `translate(${ox}px, ${oy}px) scale(${base * z})`; };
        const medir = () => {
          const r = marco.getBoundingClientRect();
          const cx = FW ? (FW / 2 - ox) / (base * z) : img.naturalWidth / 2, cy = FH ? (FH / 2 - oy) / (base * z) : img.naturalHeight / 2;
          FW = r.width; FH = r.height;
          base = Math.max(FW / img.naturalWidth, FH / img.naturalHeight);
          ox = FW / 2 - cx * base * z; oy = FH / 2 - cy * base * z;
          pintar();
        };
        const cambiarZoom = (nuevo, px = FW / 2, py = FH / 2) => {   // zoom manteniendo fijo el punto (px, py)
          nuevo = Math.min(4, Math.max(1, nuevo));
          const k = nuevo / z;
          ox = px - (px - ox) * k; oy = py - (py - oy) * k; z = nuevo; zoom.value = String(z);
          pintar();
        };
        zoom.oninput = () => cambiarZoom(+zoom.value);
        marco.addEventListener("wheel", (e) => {
          e.preventDefault();
          const r = marco.getBoundingClientRect();
          cambiarZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
        const dedos = new Map();
        let distancia = 0;
        marco.addEventListener("pointerdown", (e) => { marco.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); marco.style.cursor = "grabbing"; });
        marco.addEventListener("pointermove", (e) => {
          const antes = dedos.get(e.pointerId);
          if (!antes) return;
          dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (dedos.size === 2) {   // pellizco con dos dedos
            const [a, b] = [...dedos.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y), r = marco.getBoundingClientRect();
            if (distancia) cambiarZoom(z * dist / distancia, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            distancia = dist;
            return;
          }
          ox += e.clientX - antes.x; oy += e.clientY - antes.y;
          pintar();
        });
        const soltar = (e) => { dedos.delete(e.pointerId); distancia = 0; marco.style.cursor = "grab"; };
        marco.addEventListener("pointerup", soltar);
        marco.addEventListener("pointercancel", soltar);
        const cerrar = (blob) => { window.removeEventListener("resize", medir); capa.remove(); URL.revokeObjectURL(url); resolver(blob); };
        window.addEventListener("resize", medir);
        capa.querySelector('[data-e="no"]').onclick = () => cerrar(null);
        capa.querySelector('[data-e="si"]').onclick = () => {
          const c = document.createElement("canvas");
          c.width = FOTO_W; c.height = FOTO_H;
          const k = FOTO_W / FW, ctx = c.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, ox * k, oy * k, img.naturalWidth * base * z * k, img.naturalHeight * base * z * k);
          c.toBlob(b => b ? cerrar(b) : alert("No se ha podido preparar la foto."), "image/jpeg", 0.88);
        };
        requestAnimationFrame(medir);
      };
      img.src = url;
    });
  }

  async function anadirFotos(files) {
    const libres = MAX_FOTOS - fotosEvento.length;
    const lista = Array.from(files || []).filter(f => f.type.startsWith("image/"));
    if (lista.length > libres) alert(`Como mucho ${MAX_FOTOS} fotos. Se añaden las ${libres} primeras.`);
    for (const f of lista.slice(0, libres)) {
      const blob = await encuadrar(f);
      if (blob) fotosEvento.push({ blob, url: URL.createObjectURL(blob) });
    }
    pintarFotos();
  }

  function pintarFotos() {
    const el = document.getElementById("igEvMiniaturas");
    el.innerHTML = fotosEvento.map((f, i) => `
      <div style="position:relative; aspect-ratio:4/5;">
        <img src="${f.url}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">
        <button type="button" data-quitar="${i}" aria-label="Quitar foto" style="position:absolute; top:2px; right:2px; border:0; border-radius:50%; width:22px; height:22px; background:rgba(0,0,0,.65); color:#fff; cursor:pointer;">✕</button>
      </div>`).join("");
    el.querySelectorAll("[data-quitar]").forEach(b => b.onclick = () => {
      const [f] = fotosEvento.splice(+b.dataset.quitar, 1); URL.revokeObjectURL(f.url); pintarFotos();
    });
  }

  function aBase64(blob) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => mal(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function subirArchivo(path, blob, msg) {
    const r = await fetch(api(path), { method: "PUT", headers: hdr({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: msg, content: await aBase64(blob) }) });
    if (!r.ok) throw new Error(`No se ha podido subir la foto (${r.status}).`);
  }

  /* ---------- Resultados: antes de pedir el reel, fotos de los partidos que no tengan ---------- */
  // Mismo cálculo que el Action (generar_reel.py): partidos con resultado de la semana pasada
  const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  const normT = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parecido = (a, b) => { const x = normT(a), y = normT(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  let resPartidos = [];   // [{ id, equipo, rival, fecha, marcador, tiene, blob, url }]
  let resRango = null;

  function rangoResultados() {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const dom = new Date(hoy); dom.setDate(hoy.getDate() - ((hoy.getDay() + 7) % 7));   // domingo pasado (u hoy)
    const lun = new Date(dom); lun.setDate(dom.getDate() - 6);
    return { desde: isoDia(lun), hasta: isoDia(dom) };
  }

  function partidosConResultado(desde, hasta) {
    const cp = window.cpGetData ? window.cpGetData() : null;
    const out = [];
    Object.entries((cp && cp.teams) || {}).forEach(([clave, info]) => (info.matches || []).forEach(m => {
      if (!m.date || m.date < desde || m.date > hasta) return;
      const r = /\s(\d)\s*-\s*(\d)\s*\(/.exec(m.raw || "");
      if (!r) return;
      const rival = apos(m.rival);
      out.push({ id: `${clave}|${m.date}|${rival}`, equipo: clave.replace(/\s*\(.*\)\s*$/, ""), rival, fecha: m.date, marcador: `${r[1]}-${r[2]}` });
    }));
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function rangoDeNombre(nombre) {   // "Resultados del 26 de septiembre al 4 de octubre del 2026.json"
    const t = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const y = (t.match(/\b(20\d\d)\b/) || [])[1];
    const dias = [...t.matchAll(/\b(\d{1,2}) de ([a-z]+)/g)].map(m => ({ d: +m[1], m: MESES_L.indexOf(m[2]) })).filter(x => x.m >= 0);
    if (!y || !dias.length) return null;
    const a = dias[0], b = dias[dias.length - 1];
    const iso = (yy, x) => `${yy}-${String(x.m + 1).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
    return { desde: iso(a.m > b.m ? +y - 1 : +y, a), hasta: iso(+y, b) };
  }

  // Fotos ya guardadas desde Resultados.html para esas fechas (el Action las usa solas)
  async function fotosGuardadas(desde, hasta) {
    const r = await fetch(api("PartidosyResultados"), { headers: hdr(), cache: "no-store" });
    if (!r.ok) return [];
    const archivos = ((await r.json()) || []).filter(a => a.type === "file" && /^Resultados.*\.json$/i.test(a.name))
      .filter(a => { const x = rangoDeNombre(a.name); return x && x.desde <= hasta && x.hasta >= desde; });
    const cards = [];
    for (const a of archivos) {
      try { ((await getJson(`PartidosyResultados/${a.name}`)) || {}).cards.forEach(c => { if (c.photo && c.photo.file) cards.push(c); }); }
      catch (e) { console.warn("No se ha podido leer", a.name, e); }
    }
    return cards;
  }

  async function prepararResultados() {
    resRango = rangoResultados();
    resPartidos.forEach(p => p.url && URL.revokeObjectURL(p.url));
    resPartidos = partidosConResultado(resRango.desde, resRango.hasta);
    if (!resPartidos.length) { pedirPartidos("resultados"); return; }
    verPaso("resultados");
    document.getElementById("igResInfo").textContent = "Buscando las fotos de los partidos…";
    document.getElementById("igResLista").innerHTML = "";
    try {
      const cards = await fotosGuardadas(resRango.desde, resRango.hasta);
      resPartidos.forEach(p => {
        p.tiene = cards.some(c => (parecido(c.homeTeam, p.equipo) && parecido(c.awayTeam, p.rival)) ||
                                  (parecido(c.awayTeam, p.equipo) && parecido(c.homeTeam, p.rival)));
      });
    } catch (e) { console.warn(e); }
    if (resPartidos.every(p => p.tiene)) { pedirPartidos("resultados"); return; }
    pintarResultados();
  }

  function pintarResultados() {
    const faltan = resPartidos.filter(p => !p.tiene && !p.blob).length;
    document.getElementById("igResInfo").textContent = faltan
      ? `${faltan} partido(s) sin foto. Puedes añadirlas ahora (es opcional): saldrán en su diapositiva.`
      : "Todos los partidos tienen foto.";
    const el = document.getElementById("igResLista");
    el.innerHTML = resPartidos.map((p, i) => `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:10px;">
        ${p.url ? `<img src="${p.url}" alt="" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">` : ""}
        <div style="flex:1; min-width:0; font-size:0.78rem; color:#1e293b;"><b>${esc(p.equipo)}</b> ${esc(p.marcador)} ${esc(p.rival)}<br>
          <small style="color:#64748b;">${fmt(p.fecha)}${p.tiene ? " · 📸 ya tiene foto" : ""}</small></div>
        <label class="btn-save-session" style="width:auto; flex:none; white-space:nowrap; margin:0; padding:6px 10px; font-size:0.72rem; cursor:pointer; background:${p.tiene || p.blob ? "#64748b" : "var(--btn-fondoVerde)"};">
          ${p.blob ? "Cambiar" : p.tiene ? "Otra foto" : "➕ Foto"}<input type="file" accept="image/*" hidden data-res="${i}"></label>
      </div>`).join("");
    el.querySelectorAll("[data-res]").forEach(inp => inp.onchange = async () => {
      const p = resPartidos[+inp.dataset.res], f = inp.files && inp.files[0];
      if (!f) return;
      inp.value = "";
      const blob = await encuadrar(f);
      if (!blob) return;
      if (p.url) URL.revokeObjectURL(p.url);
      Object.assign(p, { blob, url: URL.createObjectURL(blob) });
      pintarResultados();
    });
  }

  async function pedirResultados() {
    const boton = document.getElementById("igResPedir"), estado = document.getElementById("igResEstado");
    const conFoto = resPartidos.filter(p => p.blob);
    boton.disabled = true;
    const id = Date.now().toString(36);
    try {
      const fotos = {};
      for (let i = 0; i < conFoto.length; i++) {
        estado.textContent = `Subiendo foto ${i + 1} de ${conFoto.length}…`;
        const ruta = `Reels/fotos/${id}/foto_${String(i + 1).padStart(2, "0")}.jpg`;
        await subirArchivo(ruta, conFoto[i].blob, `Foto ${i + 1} del reel ${id}`);
        fotos[conFoto[i].id] = ruta;
      }
      estado.textContent = "";
      await pedirPartidos("resultados", { desde: resRango.desde, hasta: resRango.hasta, fotos, id });
    } catch (e) {
      estado.textContent = "";
      alert(e.message);
    } finally {
      boton.disabled = false;
    }
  }

  function generar() {
    crearMenu();
    verPaso("menu");
    document.getElementById("modalIgGenerar").classList.add("active");
  }

  async function pedirPartidos(tipo, extra) {
    cerrarMenu();
    try {
      await putJson("Reels/solicitud.json", Object.assign({ id: Date.now().toString(36), tipo, pedido: new Date().toISOString() }, extra || {}),
        `Pedir reel ${tipo}`);
      alert("Pedido. El borrador aparecerá aquí en unos minutos (pulsa 🔄 para actualizar).");
    } catch (e) { alert(e.message); }
  }

  async function pedirEvento() {
    const titulo = document.getElementById("igEvTitulo").value.trim();
    const texto = document.getElementById("igEvTexto").value.trim();
    if (!titulo) { alert("Pon un título al reel."); return; }
    if (!texto) { alert("Explica un poco de qué va el reel (puedes dictarlo)."); return; }
    if (!fotosEvento.length) { alert("Añade al menos una foto."); return; }
    pararDictado();
    const boton = document.getElementById("igEvPedir"), estado = document.getElementById("igEvEstado");
    boton.disabled = true;
    const id = Date.now().toString(36);
    try {
      const fotos = [];
      for (let i = 0; i < fotosEvento.length; i++) {
        estado.textContent = `Subiendo foto ${i + 1} de ${fotosEvento.length}…`;
        const ruta = `Reels/eventos/${id}/foto_${String(i + 1).padStart(2, "0")}.jpg`;
        await subirArchivo(ruta, fotosEvento[i].blob, `Foto ${i + 1} del reel ${id}`);
        fotos.push(ruta);
      }
      estado.textContent = "Pidiendo el reel…";
      await putJson("Reels/solicitud.json", { id, tipo: "evento", titulo, descripcion: texto, fotos,
        pedido: new Date().toISOString() }, `Pedir reel de evento ${id}`);
      fotosEvento.forEach(f => URL.revokeObjectURL(f.url)); fotosEvento = []; pintarFotos();
      document.getElementById("igEvTitulo").value = ""; document.getElementById("igEvTexto").value = "";
      estado.textContent = "";
      cerrarMenu();
      alert("Pedido. El borrador aparecerá aquí en unos minutos (pulsa 🔄 para actualizar).");
    } catch (e) {
      estado.textContent = "";
      alert(e.message);
    } finally {
      boton.disabled = false;
    }
  }

  window.igReelsCargar = cargar;
  window.igReelsGenerar = generar;
  window.addEventListener("load", () => setTimeout(cargar, 2500));
})();
