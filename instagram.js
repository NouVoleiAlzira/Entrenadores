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
  const TIPOS = { resultados: "🏆 Resultados de la semana", proximos: "📅 Próximos partidos", actividad: "📸 Actividad" };
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
    return URL.createObjectURL(await r.blob());
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
            <div><b>${TIPOS[b.tipo] || esc(b.tipo)}</b><br><small>${fmt(b.desde)} – ${fmt(b.hasta)} · ${b.partidos || 0} partidos</small><br>
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
        <video class="ig-video" src="${videos[id]}" controls playsinline></video>
        <label class="ig-label">Texto del post${editable ? " (puedes cambiarlo)" : ""}</label>
        <textarea class="ig-texto" rows="8" ${editable ? "" : "readonly"}>${esc(meta.texto)}</textarea>
        <small class="ig-info">Música: ${esc(meta.musica || "sin música")}${meta.confirmadoPor ? ` · Confirmado por ${esc(meta.confirmadoPor)}` : ""}</small>
        ${editable ? `<div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session ig-descartar" style="flex:1; background:#64748b;">🗑️ Descartar</button>
          <button class="btn-save-session ig-confirmar" style="flex:2;">✅ Confirmar y publicar</button></div>` : ""}`;
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

  async function generar() {
    const tipo = confirm("¿Qué reel quieres generar?\n\nAceptar = Resultados de la semana\nCancelar = Próximos partidos") ? "resultados" : "proximos";
    try {
      await putJson("Reels/solicitud.json", { id: Date.now().toString(36), tipo, pedido: new Date().toISOString() }, `Pedir reel ${tipo}`);
      alert("Pedido. El borrador aparecerá aquí en unos minutos (pulsa 🔄 para actualizar).");
    } catch (e) { alert(e.message); }
  }

  window.igReelsCargar = cargar;
  window.igReelsGenerar = generar;
  window.addEventListener("load", () => setTimeout(cargar, 2500));
})();
